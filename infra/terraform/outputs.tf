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
  value = "https://${local.site_domain}"
}

# the distribution hostname is still worth having: it is what you curl when you need to
# bypass DNS and ask the CDN directly
output "site_cloudfront_domain" {
  value = aws_cloudfront_distribution.site.domain_name
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
