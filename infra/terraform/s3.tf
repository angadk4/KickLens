# Raw provider snapshots: Standard 90d -> Glacier -> expire 400d (frozen, Contract §9)
resource "aws_s3_bucket" "raw" {
  bucket = local.bucket.raw
}

resource "aws_s3_bucket_lifecycle_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    id     = "raw-retention"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 400
    }
  }
}

# Model/calibration artifacts + dataset manifests: retained indefinitely (frozen)
resource "aws_s3_bucket" "artifacts" {
  bucket = local.bucket.artifacts
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Frontend static site (served only through CloudFront via OAC)
resource "aws_s3_bucket" "site" {
  bucket = local.bucket.site
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = {
    raw       = aws_s3_bucket.raw.id
    artifacts = aws_s3_bucket.artifacts.id
    site      = aws_s3_bucket.site.id
  }

  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "site_cloudfront_only" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.all]
}
