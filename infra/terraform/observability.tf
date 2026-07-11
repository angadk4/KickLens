# SNS topic for CloudWatch alarms -> email (frozen alerting path, Contract §8)
resource "aws_sns_topic" "alerts" {
  name = "${local.prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email # requires one-time email confirmation click
}

# Log groups pre-created with the frozen 14-day retention
resource "aws_cloudwatch_log_group" "jobs" {
  for_each          = toset(["ingest", "feature", "inference", "grade"])
  name              = "/${local.prefix}/jobs/${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${local.prefix}/api"
  retention_in_days = var.log_retention_days
}
