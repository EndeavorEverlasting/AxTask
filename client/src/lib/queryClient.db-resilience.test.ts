// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ApiError,
  queryClient,
  queryRetryDelayMs,
  shouldRetryQuery,
  throwIfResNotOk,
} from "./queryClient";

describe("queryClient transient service retry contract", () => {
  it("opts a structured retryable DB 503 into retry only for the safe GET path", async () => {
    const makeResponse = () => new Response(
      JSON.stringify({
        message: "Service temporarily unavailable",
        errorClass: "DB_CONNECTION_FAILED",
        retryable: true,
        requestId: "rid-503",
      }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );

    await expect(
      throwIfResNotOk(makeResponse(), { allowDbReadRetry: true }),
    ).rejects.toMatchObject({
      status: 503,
      errorClass: "DB_CONNECTION_FAILED",
      retryable: true,
      requestId: "rid-503",
    });

    await expect(throwIfResNotOk(makeResponse())).rejects.toMatchObject({
      status: 503,
      errorClass: "DB_CONNECTION_FAILED",
      retryable: false,
    });
  });

  it("honors an explicit retryable=false DB 503", async () => {
    const response = new Response(
      JSON.stringify({
        message: "Service temporarily unavailable",
        errorClass: "DB_CAPACITY_LIMIT",
        retryable: false,
      }),
      { status: 503 },
    );

    await expect(
      throwIfResNotOk(response, { allowDbReadRetry: true }),
    ).rejects.toMatchObject({
      status: 503,
      retryable: false,
      errorClass: "DB_CAPACITY_LIMIT",
    });
  });

  it("does not retry unstructured or unrelated 503 responses", async () => {
    const upstream = new Response("upstream unavailable", {
      status: 503,
      headers: { "x-request-id": "edge-rid" },
    });
    await expect(
      throwIfResNotOk(upstream, { allowDbReadRetry: true }),
    ).rejects.toMatchObject({
      status: 503,
      retryable: false,
      requestId: "edge-rid",
    });

    const unrelated = new Response(
      JSON.stringify({ message: "Provider unavailable", retryable: true }),
      { status: 503 },
    );
    await expect(
      throwIfResNotOk(unrelated, { allowDbReadRetry: true }),
    ).rejects.toMatchObject({ status: 503, retryable: false });
  });

  it("allows at most two query retries and never retries non-503 errors", () => {
    const transient = new ApiError(503, "temporary", { retryable: true });
    expect(shouldRetryQuery(0, transient)).toBe(true);
    expect(shouldRetryQuery(1, transient)).toBe(true);
    expect(shouldRetryQuery(2, transient)).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(500, "boom", { retryable: true }))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(503, "capacity", { retryable: false }))).toBe(false);
  });

  it("keeps retry delays bounded and mutations non-retried", () => {
    expect(queryRetryDelayMs(0)).toBe(250);
    expect(queryRetryDelayMs(1)).toBe(500);
    expect(queryRetryDelayMs(10)).toBe(1_000);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});
