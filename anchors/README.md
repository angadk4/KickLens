# Public forecast anchors

One file per day, `anchors/YYYY-MM-DD.jsonl`, appended **before each match kicks off**: every
line records one official forecast's identity — match, cutoff, and the SHA-256 hash of its
canonical forecast document — at the moment it froze (kickoff−3h). A daily Merkle root over
the previous day's file is committed at 12:00 UTC, so neither a line nor a day can be quietly
rewritten without breaking the chain and this repository's Git history.

To verify a forecast: open its match page on the dashboard, copy the canonical JSON shown
there into `forecast.json` (bytes exactly as shown), run
`python -c "import hashlib;print(hashlib.sha256(open('forecast.json','rb').read()).hexdigest())"`,
find that hash on the matching line here, and confirm the line's commit predates the kickoff.

`.wiring-test.jsonl` is a pre-launch plumbing test artifact, kept for the audit trail; real
anchors are the dated files.
