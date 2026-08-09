// The dedup guarantee is the entire reason this module exists: on a scale-to-zero backend two
// concurrent GETs of one URL are two separate cold starts. If a future edit drops the in-flight
// map, /engineering silently goes back to waking the database twice for one payload — invisible
// in the UI, expensive in wall-clock. Pin it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRequestCache, cachedGet, invalidateAll, prefetch } from "./requestCache";

type FetchArgs = [string, { signal?: AbortSignal } | undefined];

function jsonResponse(body: unknown, cacheControl?: string | null, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === "cache-control" ? (cacheControl ?? null) : null) },
    json: async () => body,
  } as unknown as Response;
}

let calls: FetchArgs[];

beforeEach(() => {
  __resetRequestCache();
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(impl: (url: string) => Promise<Response>) {
  vi.stubGlobal("fetch", (url: string, init?: { signal?: AbortSignal }) => {
    calls.push([url, init]);
    return impl(url);
  });
}

describe("cachedGet — in-flight dedup", () => {
  it("TWO CONCURRENT callers of one key produce exactly ONE fetch", async () => {
    let release: (r: Response) => void = () => {};
    stubFetch(() => new Promise<Response>((res) => (release = res)));

    const a = cachedGet<{ n: number }>("http://x/activity", "/activity");
    const b = cachedGet<{ n: number }>("http://x/activity", "/activity");
    expect(calls).toHaveLength(1); // <- the whole point

    release(jsonResponse({ n: 1 }));
    expect(await a).toEqual({ n: 1 });
    expect(await b).toEqual({ n: 1 }); // both callers get the SAME payload
    expect(calls).toHaveLength(1);
  });

  it("different keys are never conflated", async () => {
    stubFetch(async (url) => jsonResponse({ url }));
    await Promise.all([
      cachedGet("http://x/a", "/a"),
      cachedGet("http://x/b", "/b"),
      cachedGet("http://x/a", "/a"),
    ]);
    expect(calls.map((c) => c[0]).sort()).toEqual(["http://x/a", "http://x/b"]);
  });

  it("a rejected in-flight request is not left poisoning the map", async () => {
    let fail = true;
    stubFetch(async () => {
      if (fail) throw new Error("network");
      return jsonResponse({ ok: true });
    });
    // both attempts fail -> the call rejects
    await expect(cachedGet("http://x/a", "/a")).rejects.toThrow();
    fail = false;
    // the NEXT call must be able to fetch again, not inherit the dead promise
    await expect(cachedGet("http://x/a", "/a")).resolves.toEqual({ ok: true });
  });
});

describe("cachedGet — TTL comes from the server, not from us", () => {
  it("a fresh entry is served from memory with no second fetch", async () => {
    stubFetch(async () => jsonResponse({ v: 1 }, "public, max-age=300"));
    await cachedGet("http://x/m", "/m");
    await cachedGet("http://x/m", "/m");
    expect(calls).toHaveLength(1);
  });

  it("the entry expires exactly when the server's max-age says it does", async () => {
    stubFetch(async () => jsonResponse({ v: 1 }, "public, max-age=60"));
    const t0 = Date.parse("2026-08-09T00:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    await cachedGet("http://x/m", "/m");

    vi.setSystemTime(t0 + 59_000);
    await cachedGet("http://x/m", "/m");
    expect(calls).toHaveLength(1); // still inside max-age

    vi.setSystemTime(t0 + 61_000);
    await cachedGet("http://x/m", "/m");
    expect(calls).toHaveLength(2); // past it
  });

  it("a response with no Cache-Control still caches, briefly", async () => {
    stubFetch(async () => jsonResponse({ v: 1 }));
    await cachedGet("http://x/h", "/h");
    await cachedGet("http://x/h", "/h");
    expect(calls).toHaveLength(1);
  });
});

describe("cachedGet — retry policy", () => {
  it("a 404 is a real answer and is NEVER retried", async () => {
    stubFetch(async () => jsonResponse({ detail: "Not Found" }, null, 404));
    await expect(cachedGet("http://x/nope", "/nope")).rejects.toThrow(/^404 /);
    expect(calls).toHaveLength(1);
  });

  it("the 404 message keeps the shape useApi parses for notFound", async () => {
    stubFetch(async () => jsonResponse({}, null, 404));
    await expect(cachedGet("http://x/nope", "/nope")).rejects.toThrow("404 /nope");
  });

  it("a network failure is retried exactly once, then succeeds", async () => {
    let n = 0;
    stubFetch(async () => {
      n += 1;
      if (n === 1) throw new Error("network down");
      return jsonResponse({ v: "second try" });
    });
    await expect(cachedGet("http://x/a", "/a")).resolves.toEqual({ v: "second try" });
    expect(calls).toHaveLength(2);
  });

  it("passes an AbortSignal so a hung cold start cannot wait forever", async () => {
    stubFetch(async () => jsonResponse({ v: 1 }));
    await cachedGet("http://x/a", "/a");
    expect(calls[0]![1]?.signal).toBeDefined();
  });
});

describe("invalidateAll", () => {
  it("forces the next call back to the network (retry/refresh must not be a no-op)", async () => {
    stubFetch(async () => jsonResponse({ v: 1 }, "public, max-age=3600"));
    await cachedGet("http://x/m", "/m");
    await cachedGet("http://x/m", "/m");
    expect(calls).toHaveLength(1);

    invalidateAll();
    await cachedGet("http://x/m", "/m");
    expect(calls).toHaveLength(2);
  });
});

describe("prefetch", () => {
  it("warms the cache so the real call costs nothing", async () => {
    stubFetch(async () => jsonResponse({ v: 1 }, "public, max-age=300"));
    prefetch("http://x/r", "/r");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await cachedGet("http://x/r", "/r");
    expect(calls).toHaveLength(1);
  });

  it("a failing prefetch never surfaces as an unhandled rejection", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    expect(() => prefetch("http://x/r", "/r")).not.toThrow();
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
  });

  it("does not re-request something already in flight", async () => {
    stubFetch(() => new Promise<Response>(() => {}));
    prefetch("http://x/r", "/r");
    prefetch("http://x/r", "/r");
    expect(calls).toHaveLength(1);
  });
});
