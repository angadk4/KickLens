import { describe, expect, it } from "vitest";
// ?raw non-vacuity guard below — the router table is the source of truth for what exists
import mainSrc from "../main.tsx?raw";
import indexHtml from "../../index.html?raw";
import { titleFor } from "./pageTitle";

const ROUTES = ["/", "/forecasts", "/record", "/performance", "/calibration", "/ratings", "/methodology", "/engineering"];

describe("titleFor", () => {
  it("the sources actually loaded", () => {
    expect(mainSrc.length).toBeGreaterThan(500);
    expect(indexHtml.length).toBeGreaterThan(200);
  });

  it("gives every routed page a DISTINCT title", () => {
    const titles = ROUTES.map(titleFor);
    expect(new Set(titles).size).toBe(ROUTES.length);
  });

  it("covers every path in the real router table", () => {
    for (const m of mainSrc.matchAll(/path:\s*"([^"]+)"/g)) {
      const p = m[1]!;
      if (p === "*") continue;
      const path = p.startsWith("/") ? p : `/${p}`;
      // the dynamic match route resolves through the startsWith branch
      const probe = path.includes(":") ? "/match/6080" : path;
      expect(titleFor(probe), `no title for ${probe}`).toBeTruthy();
      expect(titleFor(probe)).toContain("KickLens");
    }
  });

  it("the home title still matches the static one in index.html (no flash of a different title)", () => {
    const staticTitle = /<title>([^<]+)<\/title>/.exec(indexHtml)?.[1];
    expect(staticTitle).toBeTruthy();
    expect(titleFor("/")).toBe(staticTitle);
  });

  it("unknown paths get the 404 title, which is what the router renders", () => {
    expect(titleFor("/no-such-page")).toContain("Not found");
  });

  it("carries NO metric — a number in a title is a figure without its scope or n", () => {
    // T-171: every figure renders with its evidence scope AND sample size. A <title> has room
    // for neither, so it must never carry one.
    for (const t of [...ROUTES.map(titleFor), titleFor("/match/1"), titleFor("/nope")]) {
      expect(t, `${t} contains a number`).not.toMatch(/\d/);
    }
  });
});
