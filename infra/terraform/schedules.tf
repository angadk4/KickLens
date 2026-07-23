# T-230: EventBridge schedules — the frozen operational cadence (Contract §9).
#   ingest 08:00+20:00 UTC · results-only ingest hourly 01:00–06:00 UTC · feature hourly ·
#   inference hourly · grade 2h · daily Merkle root 12:00 UTC (grade handler flag) ·
#   daily /health canary.

locals {
  schedules = {
    ingest-morning = { rule = "cron(0 8 * * ? *)", fn = "ingest", input = "{}" }
    ingest-evening = { rule = "cron(0 20 * * ? *)", fn = "ingest", input = "{}" }
    # night window: MLS finals land ~01:00–05:00 UTC; hourly results-only sweeps
    # (yesterday+today) cut finished→graded latency from up-to-13h to ~1–2h.
    # Provider budget: 6 runs × 2 calls = 12/day extra → ~30/day total vs the 100/day cap.
    ingest-results-night = { rule = "cron(0 1-6 * * ? *)", fn = "ingest", input = "{\"results_only\": true}" }
    feature-hourly       = { rule = "cron(10 * * * ? *)", fn = "feature", input = "{}" }
    inference-hourly     = { rule = "cron(20 * * * ? *)", fn = "inference", input = "{}" }
    grade-2h             = { rule = "cron(35 */2 * * ? *)", fn = "grade", input = "{}" }
    merkle-daily         = { rule = "cron(0 12 * * ? *)", fn = "grade", input = "{\"daily_merkle\": true}" }
    odds-hourly          = { rule = "cron(5 * * * ? *)", fn = "odds", input = "{}" }
    canary-daily         = { rule = "cron(0 9 * * ? *)", fn = "canary", input = "{}" }
  }
}

resource "aws_cloudwatch_event_rule" "jobs" {
  for_each = local.schedules

  name                = "${local.prefix}-${each.key}"
  schedule_expression = each.value.rule
  # T-261: ARMED 2026-07-12 (developer instruction "wire missing stuff and arm the loop").
  # ENABLED lives in code so a terraform apply can never silently disarm the live loop.
  state = "ENABLED"
}

resource "aws_cloudwatch_event_target" "jobs" {
  for_each = local.schedules

  rule  = aws_cloudwatch_event_rule.jobs[each.key].name
  arn   = aws_lambda_function.jobs[each.value.fn].arn
  input = each.value.input
}

resource "aws_lambda_permission" "events" {
  for_each = local.schedules

  statement_id  = "AllowEventBridge-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.jobs[each.value.fn].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.jobs[each.key].arn
}
