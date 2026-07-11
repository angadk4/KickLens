variable "region" {
  type    = string
  default = "us-east-1" # frozen (Contract §8)
}

variable "account_id" {
  type    = string
  default = "025042200085"
}

variable "alert_email" {
  description = "Budget + alarm notifications land here"
  type        = string
  default     = "kheraangad@gmail.com"
}

variable "budget_limit_usd" {
  type    = string
  default = "5" # frozen (Contract §9): alarm at 80% and 100%
}

variable "log_retention_days" {
  type    = number
  default = 14 # frozen (Contract §9)
}

locals {
  prefix = "kicklens"
  bucket = { # globally-unique names, account-scoped
    raw       = "${local.prefix}-${var.account_id}-raw"
    artifacts = "${local.prefix}-${var.account_id}-artifacts"
    site      = "${local.prefix}-${var.account_id}-site"
  }
}
