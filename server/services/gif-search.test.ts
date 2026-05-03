// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GifSearchConfigError,
  __internal,
  hasAnyGifProvider,
  searchGifs,
} from "./gif-search";

afterEach(() => {
  delete process.env.GIPHY_API_KEY;
  delete process.env.TENOR_API_KEY;
  vi.restoreAllMocks();
});

describe("gif-search - input sanitisation", () => {
  it("rejects empty queries", () => {
    expect(() => __internal.sanitizeQuery("")).toThrow();
    expect(() => __internal.sanitizeQuery("   ")).toThrow();
  });
  it("rejects queries that are too long", () => {
    expect(() => __internal.sanitizeQuery("a".repeat(200))).toThrow();
  });
  it("rejects queries with control characters", () => {
    expect(() => __internal.sanitizeQuery("fire\u0000bomb")).toThrow();
    expect(() => __internal.sanitizeQuery("zero\u200bwidth")).toThrow();
  });
  it("clamps limit into the [1, 24] range", () => {
    expect(__internal.clampLimit(undefined)).toBe(__internal.DEFAULT_LIMIT);
    expect(__internal.clampLimit(0)).toBe(__internal.DEFAULT_LIMIT);
    expect(__internal.clampLimit(-5)).toBe(1);
    expect(__internal.clampLimit(500)).toBe(__internal.MAX_LIMIT);
    expect(__internal.clampLimit(10)).toBe(10);
  });
});

describe("gif-search - URL scrubbing", () => {
  it("strips api_key / key / client_key from upstream URLs", () => {
    const scrubbed = __internal.scrubUrl("https://media.giphy.com/x.gif?api_key=SECRET&w=1");
    expect(scrubbed).not.toContain("SECRET");
    expect(scrubbed).not.toContain("api_key");
    expect(scrubbed).toContain("w=1");
  });
  it("is a no-op on malformed URLs", () => {
    expect(__internal.scrubUrl("not a url")).toBe("not a url");
  });
});

describe("gif-search - config gate", () => {
  it("hasAnyGifProvider reflects env", () => {
    expect(hasAnyGifProvider()).toBe(false);
    process.env.GIPHY_API_KEY = "abc";
    expect(hasAnyGifProvider()).toBe(true);
  });
  it("searchGifs throws GifSearchConfigError when key is missing", async () => {
    await expect(searchGifs("giphy", { q: "cats" })).rejects.toBeInstanceOf(
      GifSearchConfigError,
    );
    await expect(searchGifs("tenor", { q: "cats" })).rejects.toBeInstanceOf(
      GifSearchConfigError,
    );
  });
});

describe("gif-search - provider flows", () => {
  it("giphy: maps upstream, scrubs api_key from response URLs, and never echoes the API key", async () => {
    process.env.GIPHY_API_KEY = "TOP_SECRET_GIPHY";
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "abc",
              title: "cat",
              images: {
                fixed_width_small: {
                  url: "https://media.giphy.com/a.gif?api_key=LEAK",
                },
                original: { url: "https://media.giphy.com/orig.gif?api_key=LEAK" },
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const out = await searchGifs("giphy", { q: "cats", limit: 5, fetcher });
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe("giphy");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("TOP_SECRET_GIPHY");
    expect(serialized).not.toContain("LEAK");
    expect(serialized).not.toContain("api_key");
  });

  it("tenor: same contract - no key leak in the response and clean URLs", async () => {
    process.env.TENOR_API_KEY = "TENOR_TOP_SECRET";
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "xyz",
              content_description: "doggo",
              media_formats: {
                tinygif: { url: "https://media.tenor.com/t.gif?key=LEAK" },
                gif: { url: "https://media.tenor.com/g.gif?key=LEAK" },
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const out = await searchGifs("tenor", { q: "dog", limit: 2, fetcher });
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe("tenor");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("TENOR_TOP_SECRET");
    expect(serialized).not.toContain("LEAK");
    expect(serialized).not.toContain("key=");
  });

  it("surfaces upstream errors without echoing the key", async () => {
    process.env.GIPHY_API_KEY = "KEYX";
    const fetcher = vi.fn(async () => new Response("nope", { status: 502 }));
    await expect(searchGifs("giphy", { q: "cats", fetcher })).rejects.toThrow(/502/);
  });
});
