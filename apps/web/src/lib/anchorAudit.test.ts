// The Merkle port's cross-language contract. Every pinned digest below was produced by
// running packages/common/hashing.py::merkle_root itself (the authoritative Python
// implementation) — so a passing suite means the browser and the backend compute the SAME
// root from the SAME file, which is the entire claim the audit device makes.
import { describe, expect, it } from "vitest";
// the real, sealed anchor file — ?raw returns "" for missing files under some setups, so
// the non-vacuity guard below is load-bearing (the pitchBall lesson)
import realAnchorText from "../../../../anchors/2026-07-25.jsonl?raw";
import {
  auditAnchorText,
  fetchAnchorFile,
  findAnchorLine,
  merkleRootHex,
  parseAnchorJsonl,
  sealDueIso,
  sha256Hex,
} from "./anchorAudit";

const A = "aa".repeat(32);
const B = "bb".repeat(32);
const C = "cc".repeat(32);

// digests produced by the Python implementation (2026-08-01, .venv python 3.12)
const PY_EMPTY = "2e1cfa82b035c26cbbbdae632cea070514eb8b773f616aaeaf668e2f0be8f10d"; // sha256(b"empty")
const PY_PAIR = "fa0dafbf43f1f551e536353e9d1a942a8e86e41a0b58dfeaf264ef217f6b862a";
const PY_ODD = "0993562e172c64ee4dc2ecb8525986a8fbd40bf0331d49f0a90d3467b19747e3";
const PY_FIVE = "1a406b4c6e48e9b9a9be5fc1681a56aba8913e21bc7bb4dca1c596bf5da6ac38";
const PY_REAL = "b6d8c0f1cc21d16e6faaa180bbc49bb99cc86395004cbf81ab2be19db68c1f14";

describe("sha256Hex", () => {
  it("matches the FIPS 180-2 known-answer vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("merkleRootHex — the hashing.py port", () => {
  it("no leaves → sha256('empty'), exactly as Python", async () => {
    expect(await merkleRootHex([])).toBe(PY_EMPTY);
  });

  it("a single leaf is its own root", async () => {
    const single = "ab".repeat(32);
    expect(await merkleRootHex([single])).toBe(single);
  });

  it("a pair digests the UTF-8 bytes of the hex CONCATENATION (text, not decoded bytes)", async () => {
    expect(await merkleRootHex([A, B])).toBe(PY_PAIR);
    // …which is also sha256 of the 128-char string, by construction
    expect(await sha256Hex(A + B)).toBe(PY_PAIR);
  });

  it("is order-insensitive in its input (leaves are sorted first)", async () => {
    expect(await merkleRootHex([B, A])).toBe(PY_PAIR);
    expect(await merkleRootHex([C, A, B])).toBe(PY_ODD);
  });

  it("promotes an odd survivor to the END of the next level, and never re-sorts", async () => {
    // Python: level [A,B,C] → [h(A+B), C] → h(h(A+B) + C). The inner digest here starts
    // with "fa", which sorts AFTER "cc…" — so a re-sorting implementation would compute
    // h(C + h(A+B)) instead. Assert both that we match Python and that the two differ,
    // so this test cannot silently pass under a re-sorting port.
    const inner = await sha256Hex(A + B);
    expect(await merkleRootHex([A, B, C])).toBe(PY_ODD);
    expect(await sha256Hex(inner + C)).toBe(PY_ODD);
    expect(await sha256Hex(C + inner)).not.toBe(PY_ODD);
  });

  it("five leaves — two levels with odd survivors — matches Python", async () => {
    const five = ["11", "22", "33", "44", "55"].map((h) => h.repeat(32));
    expect(await merkleRootHex(five)).toBe(PY_FIVE);
  });

  it("does not mutate its input", async () => {
    const leaves = [B, A];
    await merkleRootHex(leaves);
    expect(leaves).toEqual([B, A]);
  });
});

describe("the real cross-language vector — anchors/2026-07-25.jsonl", () => {
  it("the file actually loaded (?raw non-vacuity guard)", () => {
    expect(realAnchorText.length).toBeGreaterThan(1000);
  });

  it("parses to 12 clean lines and reproduces the sealed root the backend committed", async () => {
    const file = parseAnchorJsonl(realAnchorText);
    expect(file.lines).toHaveLength(12);
    expect(file.leaves).toHaveLength(12);
    expect(file.malformed).toEqual([]);
    expect(await merkleRootHex(file.leaves)).toBe(PY_REAL);
  });

  it("line numbers are the file's own — match 6067 anchored at line 12", () => {
    const file = parseAnchorJsonl(realAnchorText);
    const line = file.lines.find((l) => l.matchId === 6067);
    expect(line?.n).toBe(12);
    expect(line?.forecastHash).toBe(
      "b51230d0e2d8def33b109cef0f161b2f934f67c21b63f3b1565e652646fd84c2",
    );
    expect(line?.cutoffUtc).toBe("2026-07-25T22:30:00+00:00");
    expect(line?.anchoredAtUtc).toBe("2026-07-25T23:20:33+00:00");
  });

  it("CRLF and LF parse identically — the wire is LF, a Windows checkout is CRLF", async () => {
    const lf = realAnchorText.replace(/\r\n/g, "\n");
    const crlf = lf.replace(/\n/g, "\r\n");
    const a = parseAnchorJsonl(lf);
    const b = parseAnchorJsonl(crlf);
    expect(b.leaves).toEqual(a.leaves);
    expect(b.lines.map((l) => l.n)).toEqual(a.lines.map((l) => l.n));
    expect(await merkleRootHex(b.leaves)).toBe(PY_REAL);
  });
});

describe("parseAnchorJsonl edge cases", () => {
  const good = (hash: string, id: number) =>
    JSON.stringify({ forecast_hash: hash, match_id: id, cutoff_utc: "2026-07-25T20:30:00+00:00" });

  it("skips blank lines but preserves FILE line numbers (GitHub's #L<n>)", () => {
    const text = `${good(A, 1)}\n\n${good(B, 2)}\n`;
    const file = parseAnchorJsonl(text);
    expect(file.lines.map((l) => l.n)).toEqual([1, 3]);
    expect(file.leaves).toEqual([A, B]);
  });

  it("records a malformed line without throwing, and excludes it from the leaves", () => {
    const text = `${good(A, 1)}\nnot json at all\n${good(B, 2)}`;
    const file = parseAnchorJsonl(text);
    expect(file.malformed).toEqual([2]);
    expect(file.leaves).toEqual([A, B]);
    expect(file.lines).toHaveLength(3);
    expect(file.lines[1]).toMatchObject({ n: 2, forecastHash: null });
  });

  it("a parseable line without a plausible 64-hex hash is malformed too", () => {
    const text = `${JSON.stringify({ forecast_hash: "0xNOTHEX", match_id: 9 })}\n${good(A, 1)}`;
    const file = parseAnchorJsonl(text);
    expect(file.malformed).toEqual([1]);
    expect(file.leaves).toEqual([A]);
  });

  it("empty text parses to an empty file", () => {
    expect(parseAnchorJsonl("")).toEqual({ lines: [], leaves: [], malformed: [] });
  });
});

describe("findAnchorLine", () => {
  const file = parseAnchorJsonl(realAnchorText);

  it("finds by hash, tolerating pasted-uppercase input", () => {
    const target = "9e1e5135dfb226cb59737210483f813f1795d57a054cf130c936ad9a4124a596";
    expect(findAnchorLine(file, target)?.matchId).toBe(6062);
    expect(findAnchorLine(file, target.toUpperCase())?.matchId).toBe(6062);
  });

  it("returns null when the hash is not in the file", () => {
    expect(findAnchorLine(file, A)).toBeNull();
  });
});

describe("auditAnchorText — the four verdicts and their precedence", () => {
  const target = "b51230d0e2d8def33b109cef0f161b2f934f67c21b63f3b1565e652646fd84c2";

  it("verified: line found and the sealed root reproduces — file facts carried", async () => {
    const audit = await auditAnchorText(realAnchorText, target, PY_REAL);
    expect(audit.kind).toBe("verified");
    if (audit.kind === "verified") {
      expect(audit.line.n).toBe(12);
      expect(audit.leafCount).toBe(12);
      expect(audit.lineCount).toBe(12);
      expect(audit.malformed).toEqual([]);
      expect(audit.root).toBe(PY_REAL);
    }
  });

  it("verified: an uppercase expected root still matches (roots are lowercase hex)", async () => {
    const audit = await auditAnchorText(realAnchorText, target, PY_REAL.toUpperCase());
    expect(audit.kind).toBe("verified");
  });

  it("seal-pending: line found, no committed root yet — the computed root is still shown", async () => {
    const audit = await auditAnchorText(realAnchorText, target, null);
    expect(audit.kind).toBe("seal-pending");
    if (audit.kind === "seal-pending") {
      expect(audit.line.n).toBe(12);
      expect(audit.computedRoot).toBe(PY_REAL);
    }
  });

  it("absent: hash not in the file — sealed flag carries whether that is alarming", async () => {
    const facts = { lineCount: 12, leafCount: 12, malformed: [] };
    const sealed = await auditAnchorText(realAnchorText, A, PY_REAL);
    expect(sealed).toEqual({ kind: "absent", sealed: true, ...facts });
    const unsealed = await auditAnchorText(realAnchorText, A, null);
    expect(unsealed).toEqual({ kind: "absent", sealed: false, ...facts });
  });

  it("absent beats root state — precedence is authored, not incidental", async () => {
    // even against a WRONG expected root, a missing line reports absent, not mismatch
    const audit = await auditAnchorText(realAnchorText, A, "00".repeat(32));
    expect(audit.kind).toBe("absent");
  });

  it("root-mismatch: line found but the sealed root does not reproduce", async () => {
    const wrong = "00".repeat(32);
    const audit = await auditAnchorText(realAnchorText, target, wrong);
    expect(audit.kind).toBe("root-mismatch");
    if (audit.kind === "root-mismatch") {
      expect(audit.computedRoot).toBe(PY_REAL);
      expect(audit.expectedRoot).toBe(wrong);
    }
  });

  it("a damaged file under a sealed root surfaces as root-mismatch, never an exception", async () => {
    const tampered = realAnchorText.replace(
      "9e1e5135dfb226cb59737210483f813f1795d57a054cf130c936ad9a4124a596",
      "garbage-not-a-hash-garbage-not-a-hash-garbage-not-a-hash-garbage",
    );
    const audit = await auditAnchorText(tampered, target, PY_REAL);
    expect(audit.kind).toBe("root-mismatch");
    if (audit.kind === "root-mismatch") {
      expect(audit.leafCount).toBe(11); // the damaged line fell out of the leaves…
      expect(audit.lineCount).toBe(12); // …but NOT out of the file the reader sees
      expect(audit.malformed).toEqual([2]); // and the verdict names it
    }
  });

  it("GARBAGE APPENDED AFTER SEALING is never a clean 'verified' — the foreign line is reported", async () => {
    // the sealed set still reproduces (the junk line isn't a leaf), so kind is verified —
    // but malformed must carry the evidence, because "proof holds — all N public lines"
    // over a 13-line file with 12 sealed lines would be a false claim. The component
    // renders this as "sealed set verified — foreign lines in file", never ⬡ proof holds.
    const appended = `${realAnchorText.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\nthis is not an anchor record\n`;
    const audit = await auditAnchorText(appended, target, PY_REAL);
    expect(audit.kind).toBe("verified");
    if (audit.kind === "verified") {
      expect(audit.root).toBe(PY_REAL);
      expect(audit.leafCount).toBe(12);
      expect(audit.lineCount).toBe(13);
      expect(audit.malformed).toEqual([13]);
    }
  });
});

describe("fetchAnchorFile — the honest failure taxonomy", () => {
  it("ok: returns the text and its UTF-8 byte count, bypassing the browser cache", async () => {
    let seenInit: RequestInit | undefined;
    const stub = (async (_url: unknown, init?: RequestInit) => {
      seenInit = init;
      return { ok: true, status: 200, text: async () => "héllo\n" };
    }) as unknown as typeof fetch;
    const result = await fetchAnchorFile("https://example.test/a.jsonl", stub);
    expect(result).toEqual({ ok: true, text: "héllo\n", bytes: 7 }); // é is 2 bytes
    expect(seenInit?.cache).toBe("no-store");
    expect(seenInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("http: a non-2xx status is reported with its code", async () => {
    const stub = (async () => ({ ok: false, status: 404, text: async () => "" })) as unknown as
      typeof fetch;
    expect(await fetchAnchorFile("u", stub)).toEqual({ ok: false, kind: "http", status: 404 });
  });

  it("unreachable: TypeError (dead network and a CSP block are indistinguishable)", async () => {
    const stub = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await fetchAnchorFile("u", stub)).toEqual({ ok: false, kind: "unreachable" });
  });

  it("timeout: an AbortError is its own kind — 'took too long' is not 'blocked'", async () => {
    const stub = (async () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      throw e;
    }) as unknown as typeof fetch;
    expect(await fetchAnchorFile("u", stub)).toEqual({ ok: false, kind: "timeout" });
  });
});

describe("sealDueIso — the merkle cron: 12:00 UTC the day after the anchor day", () => {
  it("plain day", () => {
    expect(sealDueIso("2026-07-25")).toBe("2026-07-26T12:00:00Z");
  });
  it("month rollover", () => {
    expect(sealDueIso("2026-07-31")).toBe("2026-08-01T12:00:00Z");
  });
  it("year rollover", () => {
    expect(sealDueIso("2026-12-31")).toBe("2027-01-01T12:00:00Z");
  });
  it("leap February", () => {
    expect(sealDueIso("2028-02-28")).toBe("2028-02-29T12:00:00Z");
  });
  it("malformed input returns null rather than throwing — this runs during render", () => {
    expect(sealDueIso("not-a-date")).toBeNull();
    expect(sealDueIso("2026-7-25")).toBeNull();
    expect(sealDueIso("")).toBeNull();
  });
});
