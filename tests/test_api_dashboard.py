"""Dashboard-v2 API additions (seeded DB): verification hash recompute + tamper detection,
Elo ratings replay parity, additive fields, methodology enrichment, merkle listing.
Separate module from test_api.py so its empty-DB assertions stay valid."""

import hashlib
import json
import os
from datetime import UTC, datetime, timedelta

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from common.hashing import ForecastFields, forecast_hash
    from fastapi.testclient import TestClient

    import apps.api.main as api_main
    from apps.api.main import app, db

    KICKOFF_1 = datetime(2025, 5, 10, 19, 0, 0, 500000, tzinfo=UTC)  # microseconds on purpose
    CUTOFF_1 = KICKOFF_1 - timedelta(hours=3)
    CREATION_1 = CUTOFF_1 + timedelta(minutes=7, seconds=13, microseconds=123456)
    FRESHNESS_1 = CUTOFF_1 - timedelta(minutes=90)
    MERKLE_ROOT = "ab" * 32

    # (home, away, kickoff, home_goals, away_goals, result) among teams A/B/C, season 2025
    COMPLETED = [
        ("A", "B", KICKOFF_1, 2, 1, "H"),
        ("B", "C", datetime(2025, 5, 17, 19, 0, tzinfo=UTC), 0, 0, "D"),
        ("C", "A", datetime(2025, 5, 24, 19, 0, tzinfo=UTC), 1, 3, "A"),
        ("A", "C", datetime(2025, 6, 7, 19, 0, tzinfo=UTC), 1, 1, "D"),
        ("B", "A", datetime(2025, 6, 14, 19, 0, tzinfo=UTC), 2, 0, "H"),
    ]

    @pytest.fixture(scope="module")
    def env():  # type: ignore[no-untyped-def]
        assert DATABASE_URL is not None
        cfg = Config("alembic.ini")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        conn = psycopg.connect(DATABASE_URL, autocommit=True)

        def one(sql: str, args: tuple[object, ...] = ()) -> int:
            row = (conn.execute(sql, args) if args else conn.execute(sql)).fetchone()
            assert row is not None
            return int(row[0])

        league = one("INSERT INTO league (code,name) VALUES ('MLS','MLS') RETURNING league_id")
        season = one(
            "INSERT INTO season (league_id, year) VALUES (%s, 2025) RETURNING season_id",
            (league,),
        )
        teams = {
            key: one(
                "INSERT INTO team (canonical_name) VALUES (%s) RETURNING team_id",
                (f"Team {key}",),
            )
            for key in ("A", "B", "C", "D")
        }
        match_ids: list[int] = []
        for home, away, ko, hg, ag, res in COMPLETED:
            match_ids.append(
                one(
                    "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc,"
                    " status, result, home_goals, away_goals)"
                    " VALUES (%s,%s,%s,%s,'final',%s,%s,%s) RETURNING match_id",
                    (season, teams[home], teams[away], ko, res, hg, ag),
                )
            )
        future = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'scheduled') RETURNING match_id",
            (season, teams["A"], teams["D"], datetime.now(UTC) + timedelta(days=5)),
        )
        # registry chain (direct inserts — no artifacts on disk needed)
        snap = one(
            "INSERT INTO dataset_snapshot (snapshot_hash, date_range_start, date_range_end,"
            " row_count, created_at_utc) VALUES ('dash-snap','2025-02-01','2025-06-14',5,%s)"
            " RETURNING dataset_snapshot_id",
            (datetime.now(UTC),),
        )
        trun = one(
            "INSERT INTO training_run (dataset_snapshot_id, code_git_sha, seed, lockfile_hash,"
            " status, started_at_utc) VALUES (%s,'dashsha',42,'dashlock','done',%s)"
            " RETURNING training_run_id",
            (snap, datetime.now(UTC)),
        )
        mart = one(
            "INSERT INTO model_artifact (training_run_id, artifact_uri, artifact_hash,"
            " created_at_utc) VALUES (%s,'file:///x.pkl','h',%s) RETURNING model_artifact_id",
            (trun, datetime.now(UTC)),
        )
        cart = one(
            "INSERT INTO calibration_artifact (training_run_id, method, param_t, created_at_utc)"
            " VALUES (%s,'temperature',1.157,%s) RETURNING calibration_artifact_id",
            (trun, datetime.now(UTC)),
        )
        mv = one(
            "INSERT INTO model_version (league_id, model_artifact_id, calibration_artifact_id,"
            " version_label, is_production, created_at_utc, promoted_at_utc)"
            " VALUES (%s,%s,%s,'dash-v1',true,%s,%s) RETURNING model_version_id",
            (league, mart, cart, datetime.now(UTC), datetime.now(UTC)),
        )

        def mk_run(match_id: int, cutoff: datetime, freshness: datetime) -> int:
            frow = one(
                "INSERT INTO feature_row (match_id, as_of_utc, computed_at_utc, features,"
                " inputs_hash) VALUES (%s,%s,%s,%s,'ih') RETURNING feature_row_id",
                (match_id, cutoff, cutoff, json.dumps({"elo_diff": 1.0})),
            )
            return one(
                "INSERT INTO prediction_run (match_id, cutoff_utc, feature_row_id,"
                " feature_set_version, dataset_snapshot_id, data_freshness_time_utc,"
                " stale_inputs, model_version_id, code_git_sha, seed, lockfile_hash,"
                " inputs_hash, created_at_utc)"
                " VALUES (%s,%s,%s,'fs-v1',%s,%s,false,%s,'dashsha',42,'dashlock','ih',%s)"
                " RETURNING prediction_run_id",
                (match_id, cutoff, frow, snap, freshness, mv, cutoff),
            )

        # prediction #1: REAL hash — the verification endpoint must reproduce it exactly
        fields1 = ForecastFields(
            match_id=match_ids[0],
            fixture_revision=0,
            model_version_id=mv,
            calibration_artifact_id=None,
            feature_set_version="fs-v1",
            p_home=0.512,
            p_draw=0.261,
            p_away=0.227,
            cutoff_utc=CUTOFF_1.isoformat(),
            forecast_creation_utc=CREATION_1.isoformat(),
            data_freshness_time=FRESHNESS_1.isoformat(),
        )
        run1 = mk_run(match_ids[0], CUTOFF_1, FRESHNESS_1)
        pid1 = one(
            "INSERT INTO prediction (match_id, prediction_run_id, fixture_revision, p_home,"
            " p_draw, p_away, cutoff_utc, forecast_creation_utc, is_official, forecast_hash,"
            " anchored_at_utc) VALUES (%s,%s,0,0.512,0.261,0.227,%s,%s,true,%s,%s)"
            " RETURNING prediction_id",
            (match_ids[0], run1, CUTOFF_1, CREATION_1, forecast_hash(fields1), CREATION_1),
        )
        conn.execute(
            "INSERT INTO prediction_grade (prediction_id, result_version, log_loss, rps,"
            " brier, correct, graded_at_utc) VALUES (%s,1,0.6694,0.1521,0.4402,true,%s)",
            (pid1, datetime.now(UTC)),
        )
        for ev in ("OfficialFinalized", "OfficialFrozen", "AnchorPublished"):
            conn.execute(
                "INSERT INTO prediction_event (prediction_id, match_id, event_type,"
                " event_time_utc) VALUES (%s,%s,%s,%s)",
                (pid1, match_ids[0], ev, CREATION_1),
            )
        conn.execute(  # match-level event with NO prediction_id — must not leak per-forecast
            "INSERT INTO prediction_event (prediction_id, match_id, event_type, event_time_utc,"
            " details) VALUES (NULL,%s,'Corrected',%s,%s)",
            (match_ids[0], datetime.now(UTC), json.dumps({"new_version": 2})),
        )
        conn.execute(
            "INSERT INTO anchor_merkle_root (day, root, committed_at_utc) VALUES (%s,%s,%s)",
            (CREATION_1.date(), MERKLE_ROOT, datetime.now(UTC)),
        )
        # prediction #2: TAMPERED stored hash — verification must refuse to bless it
        ko2 = COMPLETED[1][2]
        run2 = mk_run(match_ids[1], ko2 - timedelta(hours=3), ko2 - timedelta(hours=4))
        pid2 = one(
            "INSERT INTO prediction (match_id, prediction_run_id, fixture_revision, p_home,"
            " p_draw, p_away, cutoff_utc, forecast_creation_utc, is_official, forecast_hash,"
            " anchored_at_utc) VALUES (%s,%s,0,0.4,0.3,0.3,%s,%s,true,%s,%s)"
            " RETURNING prediction_id",
            (
                match_ids[1],
                run2,
                ko2 - timedelta(hours=3),
                ko2 - timedelta(hours=2, minutes=55),
                "0" * 64,
                ko2 - timedelta(hours=2, minutes=55),
            ),
        )

        # in-play cases for /matches/in-play (kicked off, ungraded, non-voided official).
        def mk_official(
            mid: int,
            run_id: int,
            rev: int,
            ph: float,
            pd: float,
            pa: float,
            hashv: str,
            when: datetime,
        ) -> int:
            return one(
                "INSERT INTO prediction (match_id, prediction_run_id, fixture_revision, p_home,"
                " p_draw, p_away, cutoff_utc, forecast_creation_utc, is_official, forecast_hash,"
                " anchored_at_utc) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s)"
                " RETURNING prediction_id",
                (mid, run_id, rev, ph, pd, pa, when, when, hashv, when),
            )

        def void_it(pid: int, mid: int, when: datetime, reason: str) -> None:
            conn.execute(
                "INSERT INTO prediction_event (prediction_id, match_id, event_type,"
                " event_time_utc, details) VALUES (%s,%s,'Voided',%s,%s)",
                (pid, mid, when, json.dumps({"reason": reason})),
            )

        # (a) MUST appear: kicked off (canonical 'in_play'), no result, ungraded, not voided.
        ko_ip = datetime.now(UTC) - timedelta(hours=1)
        m_inplay = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'in_play') RETURNING match_id",
            (season, teams["A"], teams["C"], ko_ip),
        )
        run_ip = mk_run(m_inplay, ko_ip - timedelta(hours=3), ko_ip - timedelta(hours=4))
        mk_official(m_inplay, run_ip, 0, 0.5, 0.25, 0.25, "inplayhash", ko_ip - timedelta(hours=3))

        # (a2) MUST appear: FINAL with a result but NOT yet graded — this is the grade-row-absence
        # decision; the rejected `result IS NULL` filter would wrongly drop it. Attaches an
        # official, ungraded, non-voided forecast to an existing final+result match (match_ids[2],
        # C-A result 'A'), so ratings / completed counts stay untouched.
        ko_fin = COMPLETED[2][2]
        run_fin = mk_run(match_ids[2], ko_fin - timedelta(hours=3), ko_fin - timedelta(hours=4))
        mk_official(
            match_ids[2],
            run_fin,
            0,
            0.3,
            0.3,
            0.4,
            "finalungradedhash",
            ko_fin - timedelta(hours=3),
        )

        # (b) MUST NOT appear: kicked off but VOIDED (postponed) — as Chicago 6038 was.
        ko_vd = datetime.now(UTC) - timedelta(hours=2)
        m_voided = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'postponed') RETURNING match_id",
            (season, teams["B"], teams["D"], ko_vd),
        )
        run_vd = mk_run(m_voided, ko_vd - timedelta(hours=3), ko_vd - timedelta(hours=4))
        pid_voided = mk_official(
            m_voided, run_vd, 0, 0.4, 0.3, 0.3, "voidedhash", ko_vd - timedelta(hours=3)
        )
        void_it(pid_voided, m_voided, ko_vd, "postponed")

        # (b2) MUST NOT appear: void guard ISOLATED from the status filter — status 'in_play'
        # (not excluded by status), single official VOIDED. Only the LATERAL void guard removes it.
        ko_vo = datetime.now(UTC) - timedelta(minutes=90)
        m_void_only = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'in_play') RETURNING match_id",
            (season, teams["C"], teams["B"], ko_vo),
        )
        run_vo = mk_run(m_void_only, ko_vo - timedelta(hours=3), ko_vo - timedelta(hours=4))
        pid_vo = mk_official(
            m_void_only, run_vo, 0, 0.45, 0.3, 0.25, "voidonlyhash", ko_vo - timedelta(hours=3)
        )
        void_it(pid_vo, m_void_only, ko_vo, "kickoff moved")

        # (c) MUST appear via the NEWEST NON-VOIDED official: a revised fixture — the old official
        # is voided, a newer official frozen — the endpoint must surface the new one (rev 1), never
        # the voided one (rev 0). Exercises the LATERAL 'newest non-voided' selection directly.
        ko_rv = datetime.now(UTC) - timedelta(minutes=75)
        m_revised = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'in_play') RETURNING match_id",
            (season, teams["D"], teams["A"], ko_rv),
        )
        run_old = mk_run(m_revised, ko_rv - timedelta(hours=5), ko_rv - timedelta(hours=6))
        pid_rv_old = mk_official(
            m_revised, run_old, 0, 0.2, 0.3, 0.5, "revoldhash", ko_rv - timedelta(hours=5)
        )
        void_it(pid_rv_old, m_revised, ko_rv - timedelta(hours=4), "kickoff moved")
        run_new = mk_run(m_revised, ko_rv - timedelta(hours=3), ko_rv - timedelta(hours=4))
        mk_official(
            m_revised, run_new, 1, 0.6, 0.25, 0.15, "revnewhash", ko_rv - timedelta(hours=3)
        )
        conn.execute(
            "INSERT INTO metrics_snapshot (scope, as_of_utc, payload, created_at_utc)"
            " VALUES ('test', now(), %s, now())",
            (
                json.dumps(
                    {
                        "n": 510,
                        "ece": 0.0272,
                        "classwise_ece_H": 0.0447,
                        "classwise_ece_D": 0.0124,
                        "classwise_ece_A": 0.0419,
                        "by_confidence": {"0.4-0.5": {"n": 200, "log_loss": 1.1, "accuracy": 0.41}},
                    }
                ),
            ),
        )

        os.environ["GITHUB_ANCHOR_REPO"] = "angadk4/KickLens"
        api_main._settings.cache_clear()
        api_main._RATINGS_CACHE = None

        def test_db():  # type: ignore[no-untyped-def]
            c = psycopg.connect(DATABASE_URL)
            try:
                yield c
            finally:
                c.close()

        app.dependency_overrides[db] = test_db
        with TestClient(app) as client:
            yield {
                "client": client,
                "conn": conn,
                "teams": teams,
                "match_ids": match_ids,
                "future": future,
                "mv": mv,
                "pid1": pid1,
                "pid2": pid2,
                "fields1": fields1,
                "m_inplay": m_inplay,
                "m_voided": m_voided,
                "pid_voided": pid_voided,
                "m_void_only": m_void_only,
                "m_revised": m_revised,
            }
        app.dependency_overrides.clear()
        os.environ.pop("GITHUB_ANCHOR_REPO", None)
        api_main._settings.cache_clear()
        api_main._RATINGS_CACHE = None
        conn.close()

    # ---------- verification ----------

    def test_verification_hash_match_and_anchors(env) -> None:  # type: ignore[no-untyped-def]
        res = env["client"].get(f"/matches/{env['match_ids'][0]}/verification")
        assert res.status_code == 200
        assert res.headers["cache-control"] == "public, max-age=300"
        body = res.json()
        assert body["anchor_repo"] == "angadk4/KickLens"
        (f,) = body["forecasts"]
        stored = forecast_hash(env["fields1"])
        assert f["forecast_hash"] == f["recomputed_hash"] == stored
        assert f["hash_match"] is True and f["voided"] is False
        # the published canonical document really hashes to the stored value
        assert f["canonical_json"] is not None
        assert hashlib.sha256(f["canonical_json"].encode()).hexdigest() == stored
        assert f["fields"]["p_home"] == 0.512
        assert f["fields"]["cutoff_utc"] == CUTOFF_1.isoformat()  # full hash precision
        assert f["fields"]["forecast_creation_utc"] == CREATION_1.isoformat()
        # lineage
        assert f["model_label"] == "dash-v1" and f["seed"] == 42
        assert f["code_git_sha"] == "dashsha" and f["stale_inputs"] is False
        # public anchor pointers
        assert f["anchor_day"] == "2025-05-10"
        assert f["anchor_file"]["raw_url"] == (
            "https://raw.githubusercontent.com/angadk4/KickLens/main/anchors/2025-05-10.jsonl"
        )
        line = json.loads(f["expected_anchor_line"])
        assert line["forecast_hash"] == stored and line["match_id"] == env["match_ids"][0]
        assert line["cutoff_utc"] == CUTOFF_1.isoformat()
        assert "." not in line["anchored_at_utc"]  # anchor lines use seconds precision
        assert f["merkle"]["root"] == MERKLE_ROOT and f["merkle"]["day"] == "2025-05-10"
        assert any(e["type"] == "AnchorPublished" for e in f["events"])
        assert all(e["type"] != "Corrected" for e in f["events"])  # match-level events excluded

    def test_verification_tamper_detected(env) -> None:  # type: ignore[no-untyped-def]
        body = env["client"].get(f"/matches/{env['match_ids'][1]}/verification").json()
        (f,) = body["forecasts"]
        assert f["forecast_hash"] == "0" * 64
        assert f["hash_match"] is False
        assert f["recomputed_hash"] != f["forecast_hash"]
        assert f["canonical_json"] is None  # never bless a document that doesn't hash

    def test_verification_match_without_officials(env) -> None:  # type: ignore[no-untyped-def]
        body = env["client"].get(f"/matches/{env['future']}/verification").json()
        assert body["forecasts"] == [] and body["home"] == "Team A"

    # ---------- ratings ----------

    def test_ratings_match_reference_replay(env) -> None:  # type: ignore[no-untyped-def]
        from features.elo import EloMatch, run_chronologically

        body = env["client"].get("/teams/ratings").json()
        assert body["n_rated_matches"] == 5 and body["season"] == 2025
        teams = env["teams"]
        ms = [
            EloMatch(
                match_id=i,
                season_year=2025,
                order_key=ko,
                match_date=ko.date(),
                home_team_id=teams[h],
                away_team_id=teams[a],
                home_goals=hg,
                away_goals=ag,
            )
            for i, (h, a, ko, hg, ag, _res) in enumerate(COMPLETED)
        ]
        final: dict[int, float] = {}
        for m, _pre_h, _pre_a, post_h, post_a in run_chronologically(ms):
            final[m.home_team_id] = post_h
            final[m.away_team_id] = post_a
        by_name = {t["team"]: t for t in body["teams"]}
        for key in ("A", "B", "C"):
            assert by_name[f"Team {key}"]["rating"] == pytest.approx(
                round(final[teams[key]], 1), abs=1e-9
            )
        # ratings sorted desc, ranks contiguous
        ratings = [t["rating"] for t in body["teams"]]
        assert ratings == sorted(ratings, reverse=True)
        assert [t["rank"] for t in body["teams"]] == list(range(1, len(ratings) + 1))
        # forms (most recent first, from each team's perspective)
        assert by_name["Team A"]["form"] == "LDWW"
        assert by_name["Team B"]["form"] == "WDL"
        assert by_name["Team C"]["form"] == "DLD"
        # promoted team with no completed matches: baseline rating, honest emptiness
        d = by_name["Team D"]
        assert d["rating"] == 1500.0 and d["form"] == "" and d["delta_5"] is None
        assert d["provisional"] is True and d["played_season"] == 0
        assert all(t["provisional"] is True for t in body["teams"])  # everyone < 10 played
        assert by_name["Team A"]["played_season"] == 4
        assert "history" not in by_name["Team A"]  # default response omits history

    def test_ratings_history_param(env) -> None:  # type: ignore[no-untyped-def]
        body = env["client"].get("/teams/ratings", params={"history": 2}).json()
        by_name = {t["team"]: t for t in body["teams"]}
        assert len(by_name["Team A"]["history"]) == 2  # trimmed to last N
        dates = [p["date"] for p in by_name["Team A"]["history"]]
        assert dates == sorted(dates)  # chronological
        assert by_name["Team D"]["history"] == []

    # ---------- additive extensions ----------

    def test_completed_items_include_rps_brier(env) -> None:  # type: ignore[no-untyped-def]
        body = env["client"].get("/predictions/completed").json()
        assert body["total_graded"] == 1
        item = next(i for i in body["items"] if i["match_id"] == env["match_ids"][0])
        assert item["rps"] == 0.1521 and item["brier"] == 0.4402
        assert item["log_loss"] == 0.6694 and item["correct"] is True  # legacy keys intact

    def test_match_detail_additive_fields(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        conn.execute(
            "INSERT INTO draft_prediction (match_id, model_version_id, p_home, p_draw, p_away,"
            " generated_at_utc) VALUES (%s,%s,0.41,0.3,0.29,now()) ON CONFLICT DO NOTHING",
            (env["future"], env["mv"]),
        )
        draft_body = env["client"].get(f"/matches/{env['future']}").json()
        assert draft_body["draft"]["p_home"] == 0.41  # preliminary exposed on detail
        body = env["client"].get(f"/matches/{env['match_ids'][0]}").json()
        assert body["draft"] is None  # no draft row → honest null
        assert body["neutral_site"] is False
        (f,) = body["forecasts"]
        assert f["prediction_id"] == env["pid1"]
        assert f["anchored_at_utc"] is not None and f["stale_inputs"] is False
        assert f["model_version_id"] == env["mv"] and f["model_label"] == "dash-v1"
        assert f["voided"] is False
        corrected = next(e for e in body["events"] if e["type"] == "Corrected")
        assert corrected["details"] == {"new_version": 2}

    def test_methodology_db_backed(env) -> None:  # type: ignore[no-untyped-def]
        body = env["client"].get("/methodology").json()
        assert body["calibration"]["param_t"] == 1.157
        assert body["calibration"]["method"] == "temperature"
        assert body["dataset"]["snapshot_hash"] == "dash-snap"
        assert body["dataset"]["row_count"] == 5
        assert body["dataset"]["date_range_end"] == "2025-06-14"
        assert body["anchor_repo_html_url"] == (
            "https://github.com/angadk4/KickLens/tree/main/anchors"
        )

    def test_merkle_roots_lists_seeded_day(env) -> None:  # type: ignore[no-untyped-def]
        body = env["client"].get("/merkle-roots").json()
        assert body["repo"] == "angadk4/KickLens"
        (item,) = body["items"]
        assert item["day"] == "2025-05-10" and item["root"] == MERKLE_ROOT
        assert "angadk4/KickLens" in item["anchor_file_raw_url"]

    def test_calibration_includes_test_scope_only_when_present(env) -> None:  # type: ignore[no-untyped-def]
        cal = env["client"].get("/calibration").json()
        assert cal["test"]["ece"] == 0.0272 and cal["test"]["n"] == 510
        assert cal["test"]["classwise_ece_D"] == 0.0124  # per-outcome calibration exposed
        assert "dev" not in cal  # not seeded in this module — scopes never leak

    # ---------- in-play / awaiting result ----------

    def test_in_play_awaiting_result_filter(env) -> None:  # type: ignore[no-untyped-def]
        res = env["client"].get("/matches/in-play")
        assert res.status_code == 200
        assert res.headers["cache-control"] == "public, max-age=60"
        body = res.json()
        ids = {row["match_id"] for row in body}
        # APPEARS: live in-play, final-but-ungraded, and the revised fixture (via its new official)
        assert env["m_inplay"] in ids
        assert env["match_ids"][2] in ids  # status 'final' + result set but NO grade row → visible
        assert env["m_revised"] in ids
        # EXCLUDED: voided (postponed), voided-only on a non-excluded status, graded, and future
        assert env["m_voided"] not in ids  # excluded by the void guard (and the status filter)
        assert env["m_void_only"] not in ids  # status 'in_play' → ONLY the void guard removes it
        assert env["match_ids"][0] not in ids  # graded → lives in /predictions/completed
        assert env["future"] not in ids  # kickoff still in the future
        # the live row carries the frozen official + canonical status, no grade/result blended in
        live = next(r for r in body if r["match_id"] == env["m_inplay"])
        assert live["forecast"]["type"] == "official-frozen"
        assert (
            live["forecast"]["p_home"] == 0.5 and live["forecast"]["forecast_hash"] == "inplayhash"
        )
        assert live["status"] == "in_play"
        assert "result" not in live and "log_loss" not in live
        # a final-but-ungraded match surfaces with status 'final' — proves grade-row-absence
        # (not result-null), and drives the InPlaySection 'full time · awaiting grade' branch
        fin = next(r for r in body if r["match_id"] == env["match_ids"][2])
        assert fin["status"] == "final"
        # the revised fixture surfaces the NEWEST NON-VOIDED official — never the voided rev 0
        rev = next(r for r in body if r["match_id"] == env["m_revised"])
        assert rev["forecast"]["forecast_hash"] == "revnewhash" and rev["forecast"]["p_home"] == 0.6

    def test_match_detail_exposes_void_reason(env) -> None:  # type: ignore[no-untyped-def]
        voided = env["client"].get(f"/matches/{env['m_voided']}").json()
        (f,) = voided["forecasts"]
        assert f["voided"] is True and f["void_reason"] == "postponed"
        # a non-voided official carries a null reason (additive field degrades cleanly)
        graded = env["client"].get(f"/matches/{env['match_ids'][0]}").json()
        assert graded["forecasts"][0]["void_reason"] is None
