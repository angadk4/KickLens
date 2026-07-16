// The system, for people who build systems: invariants and their enforcement mechanisms,
// the deployed architecture, how it's operated, and what went wrong. Every claim is
// checkable — a file, a trigger, a workflow, or a public anchor. No new endpoints:
// this page renders from verified static facts plus /health and /predictions/completed.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Section } from "../../components/ui/Section";
import { StatTile } from "../../components/ui/StatTile";
import { useApi } from "../../lib/useApi";
import { ArchitectureDiagram, DiagramWhys } from "./ArchitectureDiagram";

const REPO = "https://github.com/angadk4/KickLens";

const INVARIANTS = [
  {
    what: "Official forecasts are write-once",
    how: "Postgres BEFORE UPDATE OR DELETE triggers raise on the prediction ledger, belt-and-braces with an app-level guard. State changes append events; a postponement voids the old row and freezes a new one — the original is kept forever.",
    where: "migrations/0002",
    href: "/blob/main/migrations/versions/0002_audit_ops.py",
  },
  {
    what: "No feature may see the future",
    how: "A point-in-time feature engine plus a never-cut leakage suite (R1–R8): bit-for-bit recompute parity over all 5,763 stored feature rows, tamper tests that flip a later result and assert earlier rows are unchanged, and a leak canary proving the detector itself works.",
    where: "tests/test_leakage.py",
    href: "/blob/main/tests/test_leakage.py",
  },
  {
    what: "Evidence scopes never merge",
    how: "Dev, test, backtest, and live are separate keys end-to-end. The API rejects unknown scopes, and the UI's stat component requires a scope and sample size before it will render a number.",
    where: "apps/api/main.py",
    href: "/blob/main/apps/api/main.py",
  },
  {
    what: "The 2025 test was touched exactly once",
    how: "A triple-gated runner (signed checklist, deliberate env flag, refuses to run if output exists) evaluated the sealed season once, on Jul 12, 2026, under a public pre-training git tag. The season is spent and can never be reused.",
    where: "docs/final-test-report-2025.md",
    href: "/blob/main/docs/final-test-report-2025.md",
  },
];

const INCIDENTS = [
  {
    when: "Jul 2026",
    what: "The first live alarm was a false positive",
    how: "The 09:00 canary timed out on a cold Lambda + Neon wake and self-cleared. The fix made the canary tolerate a cold start (3 attempts × 40s) instead of making the alarm quieter — a real outage still fails every attempt.",
    where: "jobs/handlers.py — canary retry loop",
    href: "/blob/main/jobs/handlers.py",
  },
  {
    when: "Jul 2026",
    what: "Byte-identical dependencies, different lineage hashes",
    how: "uv.lock materializes with CRLF line endings on a fresh Windows clone, so the same dependency set stamped different lockfile hashes across platforms. Fixed with in-code normalization, scoped so already-sealed experiment records keep their existing seal.",
    where: "packages/models/runlog.py — lockfile_hash",
    href: "/blob/main/packages/models/runlog.py",
  },
  {
    when: "Jul 2026",
    what: "A pre-launch adversarial review made failures loud",
    how: "Silent per-provider failures became raises (so the Errors alarm fires), the Merkle job was moved to read yesterday's file from the public repo, and anchor pushes gained a catch-up republisher for eventual publication.",
    where: "jobs/handlers.py — launch-review fixes",
    href: "/blob/main/jobs/handlers.py",
  },
];

const OMISSIONS = [
  ["No Step Functions", "choreography is $0 and sufficient for independent, idempotent hourly jobs."],
  ["No VPC, no RDS", "a VPC'd Lambda needs a NAT gateway (~$32/mo) to reach Neon; the pooled endpoint over TLS doesn't."],
  ["No staging environment", "dev + prod with Neon branch previews; the blast radius is a read-only dashboard."],
  ["No Kubernetes, no Secrets Manager, no always-on compute", "the load doesn't justify any of them."],
] as const;

export function EngineeringPage() {
  const health = useApi(() => api.health());
  const latest = useApi(() => api.completed(1));
  const latestId = latest.data?.items?.[0]?.match_id;

  return (
    <div className="page">
      <Section
        eyebrow="Engineering"
        meta={["counts as of Jul 2026", "everything links to proof"]}
        title="How it's built"
        description={
          <>
            KickLens is an MLS forecaster whose real product is the tamper-evident public
            record; this page covers the system, <Link to="/methodology">Methodology</Link>{" "}
            covers the modeling discipline. Constraints: one developer (AI-assisted, working
            against a written operating manual with hard rules and stop conditions), ~$0
            monthly infrastructure with a $5 tripwire, no staging environment, and a
            read-only public surface.
          </>
        }
      >
        <div className="grid-4">
          <StatTile label="Tests" value={194} scope="none" n={null}
            sub="leakage, write-once, hash & canary suites — run vs a real Postgres in CI" />
          <StatTile label="Monthly infra" value="~$0" scope="none" n={null}
            sub="serverless, scale-to-zero; the $5/mo budget alarm is a documented stop condition" />
          <StatTile label="Schedules + alarms" value="8 + 13" scope="none" n={null}
            sub="EventBridge crons; Errors AND Throttles per job → SNS email" />
          <StatTile label="Forecast freeze" value="T−3h" scope="none" n={null}
            sub="SHA-256 anchored to public GitHub before kickoff; daily Merkle root" />
        </div>
      </Section>

      <Section
        eyebrow="Invariants"
        meta={["4 rules", "each has an enforcer"]}
        title="Invariants first, features second"
        description="The system is organized around four things that must stay true no matter
        what else breaks. Each is enforced by a mechanism, not a policy: a database trigger,
        a CI job that fails the merge, a component that won't render a number without its
        sample size. If a rule matters, something executable owns it."
      >
        <div className="fact-rows">
          {INVARIANTS.map((r) => (
            <div key={r.what} className="fact-row">
              <h3>{r.what}</h3>
              <p>
                {r.how}{" "}
                <a href={`${REPO}${r.href}`} target="_blank" rel="noreferrer">
                  <code>{r.where}</code>
                </a>
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Architecture"
        meta={["every box exists", "in Terraform or GitHub"]}
        title="The deployed system"
        description="Serverless end to end: EventBridge crons invoke six handlers baked into
        one container image; the public API is a separate 8 MB zip with no ML libraries; the
        database is Neon Postgres on a pooled endpoint, reached without a VPC. On desktop,
        hover any box for the why — or open the one-reason-each list below."
      >
        <ArchitectureDiagram />
        <DiagramWhys />
        <p className="blurb">
          Frozen choices, one reason each: Neon over RDS (scale-to-zero fits bursty hourly
          jobs; a 30-way connection burst verified with 0 errors) · Lambda outside any VPC (a
          VPC'd Lambda needs a ~$32/mo NAT gateway to reach Neon) · S3 + CloudFront with no
          public bucket · SSM Parameter Store over Secrets Manager (free) · Terraform with
          remote state · no staging environment.
        </p>
      </Section>

      <Section
        eyebrow="Orchestration"
        meta={["no Step Functions", "by design"]}
        title="Orchestration without an orchestrator"
        description="EventBridge crons, database state-gating, and idempotency. Each job is
        safe to re-run or fire out of order; for a handful of independent hourly jobs this
        is $0 and simpler than a workflow engine."
      >
        <div className="prose">
          <p>
            The build contract originally froze "choreography with Postgres advisory locks."
            That turned out to be wrong: session advisory locks are void behind PgBouncer's
            transaction pooling — the lock releases the moment the transaction ends, which is
            exactly when it's still needed. Production uses leased, hour-bucketed job claims
            instead: a duplicate EventBridge delivery no-ops, and a crashed run's claim
            expires so the next run picks it up. The contract was amended, not worked around.
          </p>
          <p>
            Failure handling is loud, and publication is eventual: if an anchor push to GitHub
            fails, the next run re-pushes it and the daily canary counts anchors stuck
            unpublished. The daily Merkle root is computed from the public repo's copy of
            yesterday's anchor file — the public file is the authoritative record. A total
            provider outage raises an error, so the Errors alarm fires; silent degradation was
            audited out as a failure mode.
          </p>
        </div>
      </Section>

      <Section
        eyebrow="Testing"
        meta={["suites map to", "guarantees"]}
        title="Tests are the enforcement layer"
        description="Named suites own named guarantees — leakage (R1–R8), the write-once
        ledger, forecast hashing and anchoring, the canary's dead-man checks, schema audit,
        and the touch-once gate."
      >
        <div className="prose">
          <p>
            CI runs ruff, mypy, and the full suite against a real Postgres service container,
            so the database-backed guarantees run rather than skip. A final CI step re-runs
            the never-cut suites and fails the build if they silently skipped; gitleaks scans
            every commit. The same commands run locally and in CI — 194 passed, 1 skipped, as
            of July 2026. The one skip is a market-aggregation check that needs the full
            historical dataset loaded, which a fresh CI database doesn't hold.
          </p>
        </div>
      </Section>

      <Section
        eyebrow="Lineage"
        meta={["recorded per forecast", "record server-verified"]}
        title="Every forecast records its full lineage — and the server verifies the record"
        description="Two separate claims, each scoped precisely. Lineage: every official
        forecast records the dataset snapshot hash, feature-set version, model version, code
        git SHA, seed, and lockfile hash — enough to reproduce the run. The git SHA is baked
        into the container at build time, because Lambda has no git binary and lineage must
        never degrade to 'unknown' in production."
      >
        <div className="prose">
          <p>
            Verification: the forecast hash is SHA-256 over canonical JSON of a frozen
            11-field set, anchored to a public GitHub file before kickoff by construction.
            The verification endpoint recomputes the hash server-side from the database fields
            and exposes the canonical document only when it matches the stored write-once
            value — it proves the record hasn't changed and was anchored in time, not that
            the model re-runs bit-for-bit (feature recompute parity is separately enforced by
            the leakage suite).
          </p>
        </div>
        <div className="hero-ctas">
          <Link to={latestId ? `/match/${latestId}` : "/record"} className="btn primary">
            Verify a real forecast
          </Link>
          <a href={`${REPO}/tree/main/anchors`} target="_blank" rel="noreferrer" className="btn ghost">
            Public anchors ↗
          </a>
        </div>
      </Section>

      <Section
        eyebrow="Operations"
        meta={["the system", "tells on itself"]}
        title="Operating it"
        description="Eight schedules, thirteen alarms, and a canary that assumes the worst.
        Schedule state is ENABLED in code, so a terraform apply can never silently disarm
        the live loop."
      >
        <div className="prose">
          <p>
            Every job gets an Errors alarm and a Throttles alarm — a throttled job never
            runs, so it never errors, and needs its own tripwire. The API alarms at a single
            5xx: on a read-only surface, one server error is a real bug. The daily canary goes
            beyond a health probe with dead-man checks: results overdue by more than a day,
            fixtures past their cutoff with no official forecast (the single worst failure
            this project can have), and anchors stuck unpublished. Any hit raises, which is
            the alerting mechanism.
          </p>
          <p>
            The canary retries through a cold API + database wake, so scale-to-zero is a
            non-event while a real outage still fails every attempt. Costs are guarded by a
            $5/month AWS budget with alerts at 80% actual and 100% forecasted — tripping it
            is a documented stop condition. Missed cutoff → an honest "no forecast issued,"
            never back-filled. Provider down → last-known data plus a stale banner. Bad model
            → repoint the registry's production flag.
          </p>
          {health.data && (
            <p className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>
              live now: last ingest {health.data.last_ingest ?? "—"} · last grade{" "}
              {health.data.last_grade ?? "—"} ·{" "}
              {health.data.freshness_ok ? "freshness ok" : "stale"}
            </p>
          )}
        </div>
      </Section>

      <Section
        eyebrow="Delivery"
        meta={["push = deploy", "retrain monthly"]}
        title="Deploys and retraining"
        description="One push to main runs the gates and ships everything that changed."
      >
        <div className="prose">
          <p>
            CI green → the job image is built and pushed to ECR tagged with the commit SHA
            and all six functions are repointed to that commit's image; the API zip is
            rebuilt; the site is synced to S3 with a CloudFront invalidation; then Terraform
            applies any drift. Training runs monthly on GitHub Actions and produces a
            challenger that is never auto-promoted — promotion is manual behind a frozen gate
            (≥0.005 nats improvement and a 95% CI excluding zero), and rollback is repointing
            one flag. Local development is prod-shaped: Docker Compose runs the API, Postgres,
            and the job container against Alembic migrations.
          </p>
        </div>
      </Section>

      <Section
        eyebrow="Incidents"
        meta={["3 fixes", "in committed code"]}
        title="Notes from the build"
        description="Three fixes from the build, in the order they landed. Each is a comment
        in the committed code, so none of this depends on taking the page's word for it."
      >
        <div className="fact-rows">
          {INCIDENTS.map((r) => (
            <div key={r.what} className="fact-row">
              <h3>{r.what}</h3>
              <p>
                {r.how}{" "}
                <a href={`${REPO}${r.href}`} target="_blank" rel="noreferrer">
                  <code>{r.where}</code>
                </a>
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Restraint"
        meta={["cut on purpose"]}
        title="Deliberately not here"
        description="Pre-empting the 'why didn't you use X' question: each omission was a
        decision, recorded in an ADR."
      >
        <div className="fact-rows">
          {OMISSIONS.map(([what, why]) => (
            <div key={what} className="fact-row">
              <h3>{what}</h3>
              <p>{why}</p>
            </div>
          ))}
        </div>
        <p className="blurb">
          Post-MVP candidates (drift dashboards, isotonic calibration, a second league) are
          listed in the build contract, not promised here. Everything above is checkable:{" "}
          <Link to="/record">the record</Link> ·{" "}
          <a href={`${REPO}/tree/main/anchors`} target="_blank" rel="noreferrer">
            public anchors ↗
          </a>{" "}
          ·{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            source ↗
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
