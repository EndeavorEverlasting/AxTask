import { describe, expect, it, vi } from "vitest";
import { buildSnapshot, runSweep } from "./sweep";

type JsonShape = Record<string, unknown>;

function jsonResponse(body: JsonShape, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetch(responses: Record<string, Response>): typeof fetch {
  // Prefer the longest matching prefix so e.g. ".../me/chats?$skiptoken=abc"
  // is not shadowed by ".../me/chats" when both are registered.
  const keys = Object.keys(responses).sort((a, b) => b.length - a.length);
  return ((url: string) => {
    const key = String(url);
    const match = keys.find(k => key.startsWith(k));
    if (!match) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "not mocked", url: key }), { status: 404 }),
      );
    }
    return Promise.resolve(responses[match].clone());
  }) as unknown as typeof fetch;
}

describe("runSweep", () => {
  it("matches dated chats, fetches members, and skips undated topics", async () => {
    const responses: Record<string, Response> = {
      "https://graph.local/v1.0/me/chats": jsonResponse({
        value: [
          { id: "c1", topic: "NSUH - 4/11/2026" },
          { id: "c2", topic: "random non-dated chat" },
          { id: "c3", topic: "ZRC - 4/12/2026" },
        ],
      }),
      "https://graph.local/v1.0/chats/c1/members": jsonResponse({
        value: [
          { displayName: "Alejandro Perez", userId: "u1" },
          { displayName: "Rich Perez", userId: "u2" },
        ],
      }),
      "https://graph.local/v1.0/chats/c3/members": jsonResponse({
        value: [{ displayName: "Alejandro Perez", userId: "u1" }],
      }),
    };

    const progress: string[] = [];
    const result = await runSweep({
      getAccessToken: async () => "tok",
      fetchImpl: makeFetch(responses),
      graphBase: "https://graph.local/v1.0",
      onProgress: p => progress.push(p.phase),
    });

    expect(result.chats).toHaveLength(2);
    expect(result.chats.map(c => c.topic)).toEqual([
      "NSUH - 4/11/2026",
      "ZRC - 4/12/2026",
    ]);
    expect(result.chats[0].members.map(m => m.display_name)).toEqual([
      "Alejandro Perez",
      "Rich Perez",
    ]);
    expect(result.rejected_topics).toContain("random non-dated chat");
    expect(progress).toContain("done");
  });

  it("honors date range and weekendOnly filters", async () => {
    const responses: Record<string, Response> = {
      "https://graph.local/v1.0/me/chats": jsonResponse({
        value: [
          { id: "c1", topic: "NSUH - 4/11/2026" }, // Saturday, in-range
          { id: "c2", topic: "NSUH - 4/13/2026" }, // Monday (weekday)
          { id: "c3", topic: "NSUH - 3/28/2026" }, // out of range
        ],
      }),
      "https://graph.local/v1.0/chats/c1/members": jsonResponse({
        value: [{ displayName: "Alejandro Perez" }],
      }),
    };

    const result = await runSweep({
      getAccessToken: async () => "tok",
      fetchImpl: makeFetch(responses),
      graphBase: "https://graph.local/v1.0",
      filters: {
        dateFrom: "2026-04-01",
        dateTo: "2026-04-30",
        weekendOnly: true,
      },
    });

    expect(result.chats).toHaveLength(1);
    expect(result.chats[0].topic).toBe("NSUH - 4/11/2026");
  });

  it("handles @odata.nextLink pagination on /me/chats", async () => {
    const responses: Record<string, Response> = {
      "https://graph.local/v1.0/me/chats": jsonResponse({
        value: [{ id: "c1", topic: "NSUH - 4/11/2026" }],
        "@odata.nextLink": "https://graph.local/v1.0/me/chats?$skiptoken=abc",
      }),
      "https://graph.local/v1.0/me/chats?$skiptoken=abc": jsonResponse({
        value: [{ id: "c2", topic: "ZRC - 4/12/2026" }],
      }),
      "https://graph.local/v1.0/chats/c1/members": jsonResponse({
        value: [{ displayName: "A" }],
      }),
      "https://graph.local/v1.0/chats/c2/members": jsonResponse({
        value: [{ displayName: "B" }],
      }),
    };

    const result = await runSweep({
      getAccessToken: async () => "tok",
      fetchImpl: makeFetch(responses),
      graphBase: "https://graph.local/v1.0",
    });

    expect(result.chats).toHaveLength(2);
  });

  it("records member-fetch failures without aborting the sweep", async () => {
    const responses: Record<string, Response> = {
      "https://graph.local/v1.0/me/chats": jsonResponse({
        value: [
          { id: "c1", topic: "NSUH - 4/11/2026" },
          { id: "c2", topic: "ZRC - 4/12/2026" },
        ],
      }),
      "https://graph.local/v1.0/chats/c1/members": jsonResponse(
        { error: "boom" } as JsonShape,
        500,
      ),
      "https://graph.local/v1.0/chats/c2/members": jsonResponse({
        value: [{ displayName: "Alejandro Perez" }],
      }),
    };

    const result = await runSweep({
      getAccessToken: async () => "tok",
      fetchImpl: makeFetch(responses),
      graphBase: "https://graph.local/v1.0",
    });

    expect(result.chats).toHaveLength(2);
    expect(result.chats[0].members).toHaveLength(0);
    expect(result.chats[0].error).toBeTruthy();
    expect(result.chats[1].members).toHaveLength(1);
    expect(result.diagnostics.some(d => d.startsWith("[members]"))).toBe(true);
  });

  it("supports cooperative cancellation via AbortSignal", async () => {
    const controller = new AbortController();
    const fetchSpy = vi.fn(async () => {
      // Abort the controller and report the fetch as aborted on the very
      // first call so the sweep loop exits immediately.
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;

    const result = await runSweep({
      getAccessToken: async () => "tok",
      fetchImpl: fetchSpy,
      graphBase: "https://graph.local/v1.0",
      signal: controller.signal,
    });

    expect(result.diagnostics.some(d => d.includes("cancelled"))).toBe(true);
  });
});

describe("buildSnapshot", () => {
  it("flattens chat members into a snapshot payload the server can consume", () => {
    const snap = buildSnapshot(
      {
        chats: [
          {
            chat_id: "c1",
            topic: "NSUH - 4/11/2026",
            work_date: "2026-04-11",
            members: [
              { display_name: "Alejandro Perez", user_id: "u1" },
              { display_name: "Rich Perez", user_id: "u2" },
            ],
          },
        ],
        diagnostics: [],
        rejected_topics: [],
      },
      { dateFrom: "2026-04-01", dateTo: "2026-04-30", weekendOnly: true },
    );

    expect(snap.rows).toHaveLength(2);
    expect(snap.rows[0]).toMatchObject({
      work_date: "2026-04-11",
      display_name: "Alejandro Perez",
      chat_topic: "NSUH - 4/11/2026",
      chat_id: "c1",
    });
    expect(snap.filters.weekend_only).toBe(true);
    expect(snap.filters.date_from).toBe("2026-04-01");
    expect(snap.tool_version).toMatch(/browser-sweep/);
  });
});
