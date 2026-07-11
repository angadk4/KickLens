# T-221: the four job Lambdas (ONE container image, CMD per function) + the slim API zip.
# Timeouts frozen (Contract §9): ingest/feature/grade 300s, inference 120s, API 29s.

variable "jobs_image_tag" {
  type    = string
  default = "latest"
}

locals {
  job_defs = {
    ingest    = { cmd = "handlers.ingest", timeout = 300, memory = 512 }
    feature   = { cmd = "handlers.feature", timeout = 300, memory = 1024 }
    inference = { cmd = "handlers.inference", timeout = 120, memory = 1024 }
    grade     = { cmd = "handlers.grade", timeout = 300, memory = 512 }
  }
}

resource "aws_lambda_function" "jobs" {
  for_each = local.job_defs

  function_name = "${local.prefix}-${each.key}"
  role          = aws_iam_role.jobs.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.jobs.repository_url}:${var.jobs_image_tag}"
  timeout       = each.value.timeout
  memory_size   = each.value.memory

  image_config {
    command = [each.value.cmd]
  }

  environment {
    variables = {
      KICKLENS_ENV = "cloud"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = "/${local.prefix}/jobs/${each.key}"
  }

  depends_on = [aws_cloudwatch_log_group.jobs]
}

# ---- API: slim zip + Mangum (no ML libs) ----
resource "aws_lambda_function" "api" {
  function_name    = "${local.prefix}-api"
  role             = aws_iam_role.api.arn
  runtime          = "python3.12"
  handler          = "apps.api.lambda_handler.handler"
  filename         = "${path.module}/../../dist/kicklens-api.zip"
  source_code_hash = filesha256("${path.module}/../../dist/kicklens-api.zip")
  timeout          = 29
  memory_size      = 512

  environment {
    variables = {
      KICKLENS_ENV = "cloud"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = "/${local.prefix}/api"
  }

  depends_on = [aws_cloudwatch_log_group.api]
}
