
## i7OS membership badge and independent versions — 2026-10-12

Paid i7OS membership now appears left of the avatar with a benefits disclosure. Recognition uses the existing server-verified entitlement; owner exemptions remain intact. Every successful adaptation creates an independent saved version with its tone, title and slides; previous versions are preserved. Existing adapted content was backfilled. Each version supports its own deletion, copy/export and i7OS import. Owner RLS and service-only atomic completion/deletion protect saved data; deleting versions does not refund daily quotas.

Supabase migration applied (table/backfill, functions and explicit grants in three calls). Tests cover append, duplicate completion, wrong-owner deletion, RLS, permissions and quota retention. 36 tests pass; typecheck and production build pass. Signed-in visual testing remains a user-session check.

## Free lifetime trial — 2026-10-13

Production migration `20261013191802_free_trial_five_scrapes.sql` adds a persistent server-owned free reservation counter to ctt_plans. Existing monthly usage is backfilled (deleted jobs still count). Five free reservations total; sixth rejected atomically before job creation. Free daily/network cap is five; paid tiers retain existing quotas and owner exemption. Failed reservations roll back counts; accepted jobs consume a scrape even if extraction later fails. Paid reservations do not advance the free counter. The migration is an additional patch after schema.sql; do not install only the baseline schema.sql on a new database.

Dashboard uses the server trial count and opens the upgrade modal on the next extraction attempt after exhaustion; API sends a structured free_trial_exhausted response. Modal public copy hides admin preview note; history/export stays available. Owner-only logo preview retained. No new credentials.
