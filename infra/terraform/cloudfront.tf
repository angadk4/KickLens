resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.prefix}-site-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Audit fix: the site shipped with no security response headers at all. That matters more here
# than on a normal static site — KickLens's entire proposition is tamper-evidence, so anything
# that can inject script into the dashboard can silently rewrite the displayed probabilities and
# the SHA-256 hash badges, and with no frame-ancestors the site can be iframed and re-skinned
# under someone else's brand. CSP is an integrity control here, not hygiene.
#
# Why each non-obvious directive is what it is (verified against the built bundle in apps/web/dist):
#   connect-src   The SPA's ONLY network target is the HTTP API. Referenced off the API Gateway
#                 resource rather than hardcoded so the header can never drift from the real
#                 endpoint. (The GitHub links in the footer are <a href> navigations, not fetches,
#                 so they need no directive.)
#   style-src     'unsafe-inline' is required: React/framer-motion write inline style attributes
#                 and Vite can inline critical CSS. It is scoped to styles ONLY — script-src
#                 deliberately has no 'unsafe-inline', and that is the directive that actually
#                 stops injected script.
#   script-src    'self' only. The production index.html loads one external module bundle; there
#                 are no inline scripts to whitelist, so no nonce/hash plumbing is needed.
#   font-src      'self' — @fontsource woff2/woff are bundled into /assets, no CDN is contacted.
#   img-src       data: covers inline SVG/data-URI marks rendered by the app and Recharts.
#   form-action   'none' — the dashboard is strictly read-only and has no forms; this stops an
#                 injected form from exfiltrating anything.
resource "aws_cloudfront_response_headers_policy" "site_security" {
  name    = "${local.prefix}-site-security-headers"
  comment = "CSP + HSTS + nosniff + referrer-policy for the KickLens dashboard"

  security_headers_config {
    content_security_policy {
      override                = true
      content_security_policy = "default-src 'self'; connect-src 'self' ${aws_apigatewayv2_api.api.api_endpoint}; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'"
    }

    content_type_options {
      override = true # X-Content-Type-Options: nosniff
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }

    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      # Never preload: the site is on a shared *.cloudfront.net host, so a preload entry is not
      # ours to submit and would affect a domain we do not own.
      preload = false
    }

    # Belt-and-braces alongside frame-ancestors 'none', for clients that predate CSP Level 2.
    frame_options {
      override     = true
      frame_option = "DENY"
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "KickLens dashboard"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed CachingOptimized policy
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site_security.id
  }

  # SPA: route unknown paths back to index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
