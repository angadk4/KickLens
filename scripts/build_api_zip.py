"""T-181/T-221: build the slim API Lambda zip (no ML libraries — Contract §8).

Bundles: fastapi + mangum + psycopg[binary] + python-dotenv, apps/api, packages/common, and
the stdlib-only features/elo.py (Elo replay for /teams/ratings). boto3 is NOT bundled
(provided by the Lambda runtime). Output: dist/kicklens-api.zip.

Run: uv run python scripts/build_api_zip.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "dist" / "api-build"
ZIP = ROOT / "dist" / "kicklens-api.zip"
RUNTIME_DEPS = ["fastapi", "mangum", "psycopg[binary]", "python-dotenv"]
EXCLUDE_DIRS = {"__pycache__", "tests", ".dist-info"}


def _uv_command() -> list[str]:
    """Locate uv from inside this subprocess, cross-platform. The old hardcoded
    `py -3.12 -m uv` is Windows-only and broke every CI deploy (Ubuntu has no `py`).
    Try, in order: $UV (uv exports its own binary path inside `uv run` — set in BOTH CI and
    the local `uv run` invocation), uv on PATH (CI's setup-uv), `python -m uv` (uv in this
    venv), and the `py` launcher (local Windows). Return the first that actually responds."""
    candidates: list[list[str]] = []
    if env_uv := os.environ.get("UV"):
        candidates.append([env_uv])
    if on_path := shutil.which("uv"):
        candidates.append([on_path])
    candidates.append([sys.executable, "-m", "uv"])
    if sys.platform == "win32":
        candidates.append(["py", "-3.12", "-m", "uv"])
    for cmd in candidates:
        try:
            subprocess.run([*cmd, "--version"], check=True, capture_output=True)
            return cmd
        except (OSError, subprocess.CalledProcessError):
            continue
    raise RuntimeError("could not locate the uv executable (tried $UV, PATH, -m uv, py launcher)")


def main() -> int:
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)

    subprocess.run(
        [
            *_uv_command(),
            "pip",
            "install",
            "--quiet",
            "--target",
            str(BUILD),
            "--python-platform",
            "x86_64-manylinux2014",
            "--python-version",
            "3.12",
            "--no-build",
            *RUNTIME_DEPS,
        ],
        check=True,
    )
    shutil.copytree(ROOT / "apps" / "api", BUILD / "apps" / "api")
    (BUILD / "apps" / "__init__.py").write_text('"""apps"""\n')
    shutil.copytree(ROOT / "packages" / "common", BUILD / "common")
    # /teams/ratings replays Elo with the stdlib-only engine. Copy ONLY these two files —
    # never the whole package (engine.py/builder.py would drag dead weight into the slim zip).
    features_build = BUILD / "features"
    features_build.mkdir()
    for name in ("__init__.py", "elo.py"):
        shutil.copy(ROOT / "packages" / "features" / name, features_build / name)

    ZIP.parent.mkdir(exist_ok=True)
    if ZIP.exists():
        ZIP.unlink()
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(BUILD.rglob("*")):
            if path.is_dir() or any(part in EXCLUDE_DIRS for part in path.parts):
                continue
            zf.write(path, path.relative_to(BUILD))
    size_mb = ZIP.stat().st_size / 1024 / 1024
    print(f"built {ZIP} ({size_mb:.1f} MB zipped)")
    if size_mb > 50:
        print("WARNING: zip exceeds the 50 MB direct-upload limit; use S3 upload path")
    return 0


if __name__ == "__main__":
    sys.exit(main())
