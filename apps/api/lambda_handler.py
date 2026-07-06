"""T-181: Lambda entrypoint — the slim API zip wraps the FastAPI app with Mangum.
Packaging (zip build, API Gateway wiring, throttling 20/s burst 40) lands with Terraform (M8);
this module is the handler it will point at."""

from mangum import Mangum

from apps.api.main import app

handler = Mangum(app)
