# Security

This is the source of truth for this repo's security configuration —
GitHub repo/org settings, branch protection, CI/CD trust boundaries, and
the supply-chain posture for GitHub Actions and dependencies. If a setting
listed here changes in GitHub, update this file in the same change — see
`.claude/skills/security-guard`, which exists specifically to keep the two
in sync and to vet new external sources before they're added anywhere.

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/Selkomark/MinCirklen.dk/security/advisories/new)
(Security tab → "Report a vulnerability") — enabled on this repo. Don't
open a public issue for a security problem.

## Repository access

- Public repo, forking enabled — anyone can fork and open a PR.
- Write access (repo membership) is employee-only, gated by NDA and signed
  contract. No exceptions for external contributors based on contribution
  history — see the fork PR approval setting below for why that
  distinction matters.
- Current collaborators: `@blackavec` (admin)

## Branch protection — `main`

- Pull request required before merging
- 1 approving review required
- Review required from Code Owners (see `.github/CODEOWNERS`)
- Stale reviews dismissed on new pushes
- Conversation resolution required before merge
- Force pushes disabled
- Branch deletion disabled
- Merged PR branches auto-delete
- Admins can bypass (`enforce_admins: false`) — intentional: the sole
  maintainer needs to keep shipping solo without a second reviewer.
  External contributors are never admins, so this bypass never applies to
  them.

## CODEOWNERS

`* @blackavec` — every file requires the repo owner's review. Split this
by area if/when trusted employees are added as collaborators.

## GitHub Actions

### Fork PR workflow approval

**"Require approval for all external contributors."** Every workflow run
triggered by a PR from a non-member, non-owner, non-Selkomark-org account
requires a maintainer to manually click "Approve and run" — every time,
with no exemption based on contribution history.

Deliberately *not* "require approval for first-time contributors": that
setting permanently exempts a contributor after their first merged PR — a
bad actor could land one trivial PR to earn trust, then submit a malicious
one that runs unattended against real CI credentials.

### Workflow permissions

- Default `GITHUB_TOKEN`: read-only (`contents` + `packages` scopes only)
- Actions cannot create or approve pull requests

### Actions allowlist (supply-chain hardening)

`allowed_actions: selected` — only actions from these sources may be
referenced in any workflow:

- `actions/*` (GitHub-owned, via `github_owned_allowed: true`)
- `google-github-actions/*`
- `hashicorp/*`
- `oven-sh/*`

`verified_allowed: false` — deliberately not relying on GitHub's "verified
creator" badge (identity verification, not a security review) as a trust
signal. Every allowed source is explicit.

**Adding a new source** (an action from an org not in this list) requires
all four of:

1. Evaluating the source — see `.claude/skills/security-guard`
2. Adding its org pattern to `patterns_allowed`:
   `gh api --method PUT repos/Selkomark/MinCirklen.dk/actions/permissions/selected-actions --input -`
   (merge with the existing list — don't drop what's already there)
3. Adding it to the allowlist above in this file
4. Pinning every reference to it by full commit SHA (below)

### Required SHA pinning

`sha_pinning_required: true` at the repo level — every `uses:` in every
workflow must reference a full-length commit SHA, never a mutable tag
(`@v4`) or branch. A tag can be moved by the upstream maintainer (or by
whoever compromises their account); a commit SHA can't.

Convention: `uses: org/action@<40-char-sha> # v4` — the trailing comment
is for humans only, GitHub doesn't resolve it.

Currently pinned (re-derive with `grep -rn "uses:" .github/workflows/*.yml`
if this drifts — the workflow files are the source of truth, this table is
a convenience summary):

| Action                        | Pinned SHA                              | Version |
| ------------------------------ | ---------------------------------------- | ------- |
| actions/checkout               | 11d5960a326750d5838078e36cf38b85af677262 | v4      |
| actions/configure-pages        | 983d7736d9b0ae728b81ab479565c72886d7745b | v5      |
| actions/deploy-pages           | d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e | v4      |
| actions/download-artifact      | d3f86a106a0bac45b974a628896c90dbdf5c8093 | v4      |
| actions/github-script          | f28e40c7f34bde8b3046d885e986cb6290c5673b | v7      |
| actions/upload-artifact        | ea165f8d65b6e75b540449e92b4886f43607fa02 | v4      |
| actions/upload-pages-artifact  | fc324d3547104276b827a68afc52ff2a11cc49c9 | v5      |
| google-github-actions/auth     | c200f3691d83b41bf9bbd8638997a462592937ed | v2      |
| hashicorp/setup-terraform      | b9cd54a3c349d3f38e8881555d616ced269862dd | v3      |
| oven-sh/setup-bun              | 0c5077e51419868618aeaa5fe8019c62421857d6 | v2      |

## Secrets and credentials

- No `secrets.*` are referenced in any workflow — only `vars.*`
  (non-secret identifiers: WIF provider path, service account email, GCP
  project ID, state bucket name).
- GCP authentication uses Workload Identity Federation (OIDC) — no static
  service account keys, ever, anywhere in this repo or its CI.
- Cloud SQL uses IAM database authentication — no database passwords are
  ever created or stored (`IaC/modules/cloud-sql`).
- Secret Manager (`IaC/modules/secrets`) creates secret *containers* and
  IAM bindings only. Actual secret values never pass through Terraform (so
  they never land in state) — they're added out-of-band via
  `gcloud secrets versions add`.
- Local dev (`docker-compose.yml`) uses a throwaway Postgres password
  (`mincirklen`/`mincirklen`) bound to `127.0.0.1` only — not a real
  credential, never reachable outside a developer's own machine.

## Repository security features

- Secret scanning: enabled
- Secret scanning push protection: enabled (blocks pushes containing
  detectable secrets before they land)
- Private vulnerability reporting: enabled
- Dependabot security updates: enabled
- Not yet enabled — GitHub Advanced Security features, evaluate if/when
  needed: `secret_scanning_non_provider_patterns`,
  `secret_scanning_ai_detection`, `secret_scanning_validity_checks`

## Production deployment gate

- `iac-apply.yml` — the only workflow that can mutate real infrastructure
  — triggers exclusively on a `prod-*` tag push (external contributors
  can't push tags to this repo) and additionally requires manual approval
  from the `production` GitHub Environment's required reviewers
  (currently: `@blackavec`).
- `iac-plan.yml` runs `terraform plan` (read-only) on PRs touching
  `IaC/**`, gated by the fork PR approval setting above.

## Planned: private-repo deploy split

See `TODO.md` — `iac-apply.yml`/`iac-plan.yml` are planned to move to a
private companion repo before going live, since GitHub ties Actions
visibility to repo visibility and there's no way to hide CI logs on a
public repo otherwise.

## Local development

See `docs/LOCAL_DEV.md`. The local Docker Compose stack, DNS, and TLS
setup are entirely offline and self-contained to a developer's own
machine — no bearing on production security.
