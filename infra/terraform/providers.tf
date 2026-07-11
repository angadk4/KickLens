# KickLens infrastructure (T-220). Region frozen: us-east-1. State: S3 + DynamoDB lock
# (bootstrap bucket/table are created once via the AWS CLI — see infra/README.md).

terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket         = "kicklens-025042200085-tfstate"
    key            = "kicklens/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "kicklens-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project    = "kicklens"
      managed_by = "terraform"
    }
  }
}
