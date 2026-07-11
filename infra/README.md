# KickLens infrastructure

Terraform (`infra/terraform/`) manages everything in AWS `us-east-1`. **Nothing here is applied
automatically** — the developer runs/approves applies.

## One-time state bootstrap (already scripted)

The remote-state bucket + lock table are created once via the AWS CLI (they cannot live inside
the state they hold):

```sh
aws s3api create-bucket --bucket kicklens-025042200085-tfstate --region us-east-1
aws s3api put-bucket-versioning --bucket kicklens-025042200085-tfstate \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name kicklens-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
```

## Layout (T-220 core)

S3 raw (90d→Glacier→400d expire) · S3 artifacts (versioned, indefinite) · S3 site + CloudFront
(OAC, SPA fallback) · ECR `kicklens-jobs` (keep last 5) · least-privilege Lambda roles
(jobs: S3 RW + SSM read + logs · api: SSM read + logs) · SNS alerts topic → email ·
log groups 14d · **$5/month budget (80% actual / 100% forecasted alerts)**.

Secrets are NEVER in Terraform: `/kicklens/*` SSM SecureStrings are written via
`aws ssm put-parameter` (see below), read at runtime by role policy.

```sh
aws ssm put-parameter --name /kicklens/NEON_DATABASE_URL --type SecureString --value '<pooled url>'
aws ssm put-parameter --name /kicklens/HIGHLIGHTLY_KEY   --type SecureString --value '<key>'
aws ssm put-parameter --name /kicklens/SPORTSGAMEODDS_KEY --type SecureString --value '<key>'
```

## Workflow

```sh
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan    # reviewed before any apply
terraform -chdir=infra/terraform apply   # developer-approved
```

T-221 adds the Lambda functions (container + API zip) and API Gateway; T-230 the EventBridge
schedules; T-240 the CloudWatch alarms wired to the SNS topic.
