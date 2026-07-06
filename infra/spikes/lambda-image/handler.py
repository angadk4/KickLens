"""No-op Lambda handler for the T-006 image-size / cold-start spike."""

import time
from typing import Any

_import_start = time.perf_counter()
import lightgbm  # noqa: E402
import numpy  # noqa: E402
import pandas  # noqa: E402
import psycopg  # noqa: E402
import scipy  # noqa: E402
import sklearn  # noqa: E402
import statsmodels  # noqa: E402

IMPORT_SECONDS = time.perf_counter() - _import_start


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    return {
        "statusCode": 200,
        "import_seconds": round(IMPORT_SECONDS, 3),
        "versions": {
            "sklearn": sklearn.__version__,
            "lightgbm": lightgbm.__version__,
            "statsmodels": statsmodels.__version__,
            "pandas": pandas.__version__,
            "numpy": numpy.__version__,
            "scipy": scipy.__version__,
            "psycopg": psycopg.__version__,
        },
    }
