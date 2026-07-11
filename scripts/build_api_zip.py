"""T-181/T-221: build the slim API Lambda zip (no ML libraries — Contract §8).

Bundles: fastapi + mangum + psycopg[binary] + python-dotenv, apps/api, packages/common.
boto3 is NOT bundled (provided by the Lambda runtime). Output: dist/kicklens-api.zip.

Run: uv run python scripts/build_api_zip.py
"""

from __future__ import annotations

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


def main() -> int:
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)

    subprocess.run(
        [
            "py",
            "-3.12",
            "-m",
            "uv",
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
