# TODO

## Before going live: split deployment into a private repo

Decided during a pre-launch security review (2026-08-16): this repo is
public so people can fork and contribute, but GitHub ties Actions
visibility to repo visibility — there's no way to hide the Actions tab or
workflow run logs on a public repo. `iac-apply.yml` is the one workflow
that can mutate real infrastructure, so it shouldn't run in public view.

Plan:

1. Create a new **private** repo (e.g. `Selkomark/MinCirklen.dk-deploy`)
   that holds `IaC/` and `.github/workflows/iac-apply.yml` (and
   `iac-plan.yml` if plan output shouldn't be public either).
2. Re-point the GCP Workload Identity Federation trust condition
   (currently `assertion.repository == "Selkomark/MinCirklen.dk"` — see
   `IaC/bootstrap/main.tf` and `IaC/scripts/setup-gcp.sh`) at the new
   private repo's identity instead.
3. Remove `IaC/` and the iac-*.yml workflows from this public repo once
   the private one is verified working, or keep read-only copies here for
   contributor visibility with the actual apply logic only in the private
   repo.
4. This was already anticipated in `iac-apply.yml`'s own comments (tech
   spec section 7.3, "repo/pipeline split") — not a new idea, just
   executing on it.

This also simplifies the current fork-PR-approval-gate concern: once
`iac-apply.yml`/`iac-plan.yml` live in a private repo, external
contributors to the public repo have no path to trigger WIF-authenticated
GCP workflows at all, regardless of Actions approval settings.

## Add CAPTCHA (Cloudflare Turnstile) to register/profile-completion

Discussed 2026-08-26: guard the register / profile-completion flow against
bot signups with Cloudflare Turnstile rather than reCAPTCHA — no Google
tracking cookies, fits this repo's privacy-first stance for an anonymous
user base (`docs/roadmap.md` §4.1). Not needed on login itself since that's
Google OAuth, which already filters most automated abuse.

Provisioning is Terraform-manageable via the `cloudflare/cloudflare`
provider (`cloudflare_turnstile_widget` resource), same pattern as the
existing GCP `IaC/modules/*`. Needs a new `IaC/modules/cloudflare` module
plus a Cloudflare API token as a new credential in Terraform/CI (separate
from the existing GCP service-account auth), and the resulting site
key/secret key pushed into Secret Manager the same way `AUTH_SECRET` is
today.
