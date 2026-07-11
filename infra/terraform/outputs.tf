output "raw_bucket" {
  value = aws_s3_bucket.raw.bucket
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "site_bucket" {
  value = aws_s3_bucket.site.bucket
}

output "site_url" {
  value = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "ecr_jobs_repo" {
  value = aws_ecr_repository.jobs.repository_url
}

output "jobs_role_arn" {
  value = aws_iam_role.jobs.arn
}

output "api_role_arn" {
  value = aws_iam_role.api.arn
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
