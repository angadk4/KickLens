# Custom domain: kicklens.app
#
# The site ran on its raw CloudFront hostname until 2026-08-11. Everything here is in Terraform
# rather than clicked into the console, because /engineering tells the reader that every node in
# the architecture is "all in Terraform or GitHub" — a domain configured by hand would quietly
# make that false.
#
# WHY .app: kicklens.com was already taken (parked on a reseller). .app is on the HSTS preload
# list, so browsers refuse plain HTTP for it before a request is ever made. For a site whose
# whole claim is "don't trust me, verify it", a TLD where a downgrade is impossible rather than
# merely mitigated is the right fit. The distribution was already redirect-to-https, so this
# costs nothing.
#
# COST: this is the first thing in the stack that is not free. ~$20/yr registration plus $0.50/mo
# for the hosted zone, i.e. ~$2.17/mo amortised. Still well inside the $5 budget alarm, but it
# means "~$0 monthly infrastructure" on /engineering is no longer literally true — that copy was
# updated in the same change.

locals {
  site_domain  = "kicklens.app"
  site_aliases = [local.site_domain, "www.${local.site_domain}"]
}

# The zone is created by the registrar when the domain is registered, so it is looked up rather
# than declared. Registration itself stays a console action: it spends money and needs the
# registrant's legal contact details.
data "aws_route53_zone" "site" {
  name         = "${local.site_domain}."
  private_zone = false
}

# CloudFront reads certificates ONLY from us-east-1, whatever region anything else lives in.
# This stack is entirely us-east-1 already, so no extra provider alias is needed.
resource "aws_acm_certificate" "site" {
  domain_name               = local.site_domain
  subject_alternative_names = ["www.${local.site_domain}"]
  validation_method         = "DNS"

  # replace before destroying: the distribution references this cert, so tearing the old one down
  # first would leave the site without a valid certificate mid-apply
  lifecycle {
    create_before_destroy = true
  }
}

# One record per name ACM asks to prove. for_each (not count) so that adding or removing a SAN
# later re-keys cleanly instead of shuffling every record's index.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.site.domain_validation_options : o.domain_name => {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.site.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.value]
  ttl             = 60
  allow_overwrite = true
}

# Blocks until the certificate is actually ISSUED. Without this the distribution can be applied
# against a still-pending certificate and the apply fails on a confusing error.
resource "aws_acm_certificate_validation" "site" {
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Apex and www both point at the distribution. A and AAAA because the distribution has IPv6 on:
# an AAAA-less setup silently fails for IPv6-only clients.
resource "aws_route53_record" "site_a" {
  for_each = toset(local.site_aliases)
  zone_id  = data.aws_route53_zone.site.zone_id
  name     = each.value
  type     = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  for_each = toset(local.site_aliases)
  zone_id  = data.aws_route53_zone.site.zone_id
  name     = each.value
  type     = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
