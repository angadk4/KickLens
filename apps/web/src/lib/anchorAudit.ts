// The public-record auditor: fetch a day's anchor file from GitHub's CDN — a host we do
// not control — find a forecast's hash in it, and recompute the day's Merkle root from all
// of the file's lines with WebCrypto. This is what makes the proof bench more than the
// server checking itself: the document comes from our API, but the RECORD comes from a
// third party, and the seal (the day's root) is reproduced from that third party's copy.
//
// merkleRootHex is a line-for-line port of packages/common/hashing.py::merkle_root, and
// every behaviour that could silently diverge across the language boundary is pinned by a
// test against digests produced by the Python implementation itself:
//   · leaves are sorted ONCE, before the loop — later levels are combined in place, never
//     re-sorted (an inner digest may sort before a surviving leaf; re-sorting changes the
//     root on any tree with an odd level);
//   · JS Array.sort() on lowercase-hex strings ≡ Python sorted() (both compare code units,
//     and hex is ASCII);
//   · pairs are (0,1),(2,3)…; an odd survivor is appended at the END of the next level;
//   · each digest is over the UTF-8 bytes of the 128-char hex CONCATENATION (text, not
//     the decoded bytes);
//   · no leaves → sha256("empty"); a single leaf is its own root.
//
// Everything here is pure or takes its I/O as an argument, so the whole audit is testable
// in node (crypto.subtle is global since Node 19) without a browser or a network.

export type AnchorLine = {
  /** 1-based FILE line number — matches GitHub's #L<n> fragment, which is the point. */
  n: number;
  raw: string;
  forecastHash: string | null;
  matchId: number | null;
  cutoffUtc: string | null;
  anchoredAtUtc: string | null;
};

export type AnchorFile = {
  /** Every non-blank line, in file order (malformed ones included, with a null hash). */
  lines: AnchorLine[];
  /** The Merkle leaves: each well-formed line's forecast_hash, in file order. */
  leaves: string[];
  /** Line numbers that failed to parse or carry no plausible hash. */
  malformed: number[];
};

const HEX64 = /^[0-9a-f]{64}$/;

/** Parse anchor JSONL as served by raw.githubusercontent.com. Tolerates CRLF (a Windows
    checkout is CRLF; the wire is LF) and blank lines (skipped, but numbering is preserved —
    `n` must stay the number GitHub shows). A malformed line is recorded, never thrown:
    the auditor's job is to REPORT a damaged file, and an exception would hide which line. */
export function parseAnchorJsonl(text: string): AnchorFile {
  const lines: AnchorLine[] = [];
  const leaves: string[] = [];
  const malformed: number[] = [];
  const rawLines = text.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!.replace(/\r$/, "");
    if (raw.trim() === "") continue;
    const n = i + 1;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fall through with parsed = null → malformed
    }
    const obj =
      typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const hash =
      typeof obj["forecast_hash"] === "string" && HEX64.test(obj["forecast_hash"])
        ? obj["forecast_hash"]
        : null;
    if (hash === null) malformed.push(n);
    else leaves.push(hash);
    lines.push({
      n,
      raw,
      forecastHash: hash,
      matchId: typeof obj["match_id"] === "number" ? obj["match_id"] : null,
      cutoffUtc: typeof obj["cutoff_utc"] === "string" ? obj["cutoff_utc"] : null,
      anchoredAtUtc: typeof obj["anchored_at_utc"] === "string" ? obj["anchored_at_utc"] : null,
    });
  }
  return { lines, leaves, malformed };
}

/** The line whose forecast_hash is `forecastHash` (hashes are lowercase hex everywhere,
    but normalise anyway — a hash pasted from elsewhere may arrive uppercase). */
export function findAnchorLine(file: AnchorFile, forecastHash: string): AnchorLine | null {
  const needle = forecastHash.toLowerCase();
  return file.lines.find((l) => l.forecastHash === needle) ?? null;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** packages/common/hashing.py::merkle_root, exactly — see the header for the pinned
    behaviours. Deterministic and order-insensitive in its INPUT (the sort sees to that),
    order-SENSITIVE in its levels (the sort happens once). */
export async function merkleRootHex(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return sha256Hex("empty");
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      next.push(await sha256Hex(level[i]! + level[i + 1]!));
    }
    if (level.length % 2 === 1) next.push(level[level.length - 1]!);
    level = next;
  }
  return level[0]!;
}

/** What every verdict carries about the file it judged. `lineCount` is the count of
    non-blank FILE lines (what a reader sees on GitHub); `leafCount` counts only the
    well-formed anchor records that enter the Merkle tree; `malformed` names the line
    numbers that don't. The three are carried SEPARATELY because conflating them is how a
    device ends up claiming "all 11 lines" about a 12-line file — and because a malformed
    line on a SEALED day is itself evidence (the sealer refuses non-conforming lines, so
    it can only have arrived after sealing) that must never be silently swallowed. */
type FileFacts = { lineCount: number; leafCount: number; malformed: number[] };

/** The audit verdict. Precedence is authored here, not in the component:
    absent beats everything (there is no line to seal); a present line with no committed
    root is seal-pending (the root is still computed and SHOWN — the reader can hold us to
    it); only a present line under a committed root can verify or mismatch. */
export type AnchorAudit =
  | ({ kind: "verified"; line: AnchorLine; root: string } & FileFacts)
  | ({ kind: "seal-pending"; line: AnchorLine; computedRoot: string } & FileFacts)
  | ({ kind: "absent"; sealed: boolean } & FileFacts)
  | ({
      kind: "root-mismatch";
      line: AnchorLine;
      computedRoot: string;
      expectedRoot: string;
    } & FileFacts);

/** Audit anchor-file TEXT against a forecast hash and (if the day is sealed) the committed
    Merkle root. Malformed lines never throw — they are excluded from the leaves (so a
    damaged file under a sealed root surfaces as root-mismatch) and REPORTED on every
    verdict, so even a "verified" can say the file carries lines outside the sealed set. */
export async function auditAnchorText(
  text: string,
  forecastHash: string,
  expectedRoot: string | null,
): Promise<AnchorAudit> {
  const file = parseAnchorJsonl(text);
  const line = findAnchorLine(file, forecastHash);
  const facts: FileFacts = {
    lineCount: file.lines.length,
    leafCount: file.leaves.length,
    malformed: file.malformed,
  };
  if (!line) return { kind: "absent", sealed: expectedRoot !== null, ...facts };
  const computedRoot = await merkleRootHex(file.leaves);
  if (expectedRoot === null) return { kind: "seal-pending", line, computedRoot, ...facts };
  if (computedRoot === expectedRoot.toLowerCase())
    return { kind: "verified", line, root: computedRoot, ...facts };
  return {
    kind: "root-mismatch",
    line,
    computedRoot,
    expectedRoot: expectedRoot.toLowerCase(),
    ...facts,
  };
}

export const FETCH_TIMEOUT_MS = 5000;

export type AnchorFetch =
  | { ok: true; text: string; bytes: number }
  | { ok: false; kind: "unreachable" | "timeout" }
  | { ok: false; kind: "http"; status: number };

/** Fetch the raw anchor file. Failure taxonomy is deliberately small and honest:
    a CSP block and a dead network are indistinguishable from inside the page (both reject
    with TypeError), so both are ONE kind — "unreachable", rendered as "couldn't check",
    never as a failed check. `cache: "no-store"` keeps the browser's own HTTP cache out of
    a re-run; GitHub's CDN still serves with max-age 300, and the copy says so.
    The timeout is a one-shot setTimeout cleared on settle — the event-bounded exemption
    class of docs/motion.md rule 7, not a new ambient timer. */
export async function fetchAnchorFile(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AnchorFetch> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(rawUrl, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, kind: "http", status: res.status };
    const text = await res.text();
    return { ok: true, text, bytes: new TextEncoder().encode(text).length };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    return { ok: false, kind: name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** When a day's Merkle seal is due: 12:00 UTC the following day (the merkle cron —
    infra: schedules.tf). Date.UTC's day overflow handles month/year rollover. Returns
    null on input that isn't a date — this runs during render, and a display helper must
    never be the thing that throws a page down. */
export function sealDueIso(anchorDay: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDay)) return null;
  const [y, m, d] = anchorDay.split("-").map(Number);
  const due = new Date(Date.UTC(y!, m! - 1, d! + 1, 12, 0, 0));
  return Number.isNaN(due.getTime()) ? null : due.toISOString().replace(".000Z", "Z");
}
