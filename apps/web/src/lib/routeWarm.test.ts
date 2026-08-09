// The dwell gate is the whole reason this is safe to ship: without it, one mouse sweep across
// the nav launches every route's payload and wakes a 100 CU-hr/month database for nothing.
// If a future edit switches it back to firing on pointerenter, these fail.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import topNavSrc from "../components/layout/TopNav.tsx?raw";
import { __resetRequestCache } from "./requestCache";
import { cancelWarm, warmRouteNow, warmRouteOnDwell, warmableRoutes } from "./routeWarm";

let calls: string[];

beforeEach(() => {
  __resetRequestCache();
  calls = [];
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "public, max-age=300" },
      json: async () => ({}),
    } as unknown as Response);
  });
  vi.useFakeTimers();
});

afterEach(() => {
  cancelWarm();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the warm map cannot drift from the nav", () => {
  it("every link in TopNav has a warm target", () => {
    // parse the LINKS array out of the source rather than exporting it — exporting a non-component
    // from TopNav.tsx would add a third fast-refresh lint warning for no benefit.
    const block = /const LINKS = \[([\s\S]*?)\n\];/.exec(topNavSrc);
    expect(block).not.toBeNull();
    const routes = [...block![1]!.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(routes.length).toBeGreaterThanOrEqual(8); // guard against a regex that matched nothing
    const warmable = new Set(warmableRoutes());
    for (const r of routes) expect(warmable.has(r)).toBe(true);
  });
});

describe("dwell, not hover", () => {
  it("does NOT fetch on the pointer merely arriving", () => {
    warmRouteOnDwell("/record");
    expect(calls).toHaveLength(0);
  });

  it("fetches once the pointer has rested", () => {
    warmRouteOnDwell("/record");
    vi.advanceTimersByTime(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/predictions/completed");
  });

  it("A SWEEP ACROSS THE NAV FETCHES NOTHING — the case this gate exists for", () => {
    for (const r of ["/forecasts", "/record", "/performance", "/calibration", "/ratings"]) {
      warmRouteOnDwell(r);
      vi.advanceTimersByTime(40); // moving on before the dwell elapses
    }
    cancelWarm();
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
  });

  it("leaving before the dwell elapses cancels it", () => {
    warmRouteOnDwell("/ratings");
    vi.advanceTimersByTime(50);
    cancelWarm();
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
  });

  it("arming a second route replaces the first — only one timer is ever live", () => {
    warmRouteOnDwell("/ratings");
    vi.advanceTimersByTime(50);
    warmRouteOnDwell("/calibration");
    vi.advanceTimersByTime(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/calibration");
  });
});

describe("focus is unambiguous intent", () => {
  it("fetches immediately, with no dwell", () => {
    warmRouteNow("/methodology");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/methodology");
  });
});

describe("safety", () => {
  it("an unknown route is a no-op, not a crash", () => {
    expect(() => warmRouteNow("/nope")).not.toThrow();
    warmRouteOnDwell("/nope");
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
  });

  it("warming the same route twice costs one request", () => {
    warmRouteNow("/ratings");
    warmRouteNow("/ratings");
    expect(calls).toHaveLength(1);
  });
});
