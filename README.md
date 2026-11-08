# CrisisSignal

> **Did they actually say it?** Check any emergency message against what officials actually published.

During disasters, people don't see the original alert. They see screenshots, forwards, articles and clips, and fake or twisted versions spread faster than anyone can check them. CrisisSignal asks **"did the responsible agency actually say this?"** instead of "is this fake?".

- **Public-first.** CrisisSignal mirrors official feeds (weather.gov today) and anchors each alert on Solana through the `crisis_registry` Anchor program, so anyone can prove an alert is authentic and still active.
- **Check anything you receive.** Logged-in users check **text, links, screenshots or video**. Every result is published to the public **Fake-Claim Ledger** at `/ledger`, so the next person who gets the same message sees it's already been checked.

Built at MakeUC 2026. The "prove it's real" concept was inspired by TruChain (Badger Build Fest); no code was reused.

## How it works

1. **Official alerts are mirrored and anchored on Solana.** Alerts are imported from weather.gov (or added by an admin). Each alert's canonical SHA-256 `contentHash` is stored in an Alert PDA of the `crisis_registry` program, signed by the agency's wallet. The registry tracks **Active / Retracted / Superseded**, and checks read that status live.
2. **Gemini extracts the claims.** Text is checked as-is. For a **link**, the page is fetched safely and Gemini pulls out its emergency claims. For a **screenshot**, Gemini reads the image (text and context) and does the same. For a **video**, it's matched by exact file hash against official videos, otherwise Gemini transcribes it. The extracted claims are what get checked, and the result page shows them under "What Gemini extracted".
3. **Semantic RAG over official alerts and the public ledger.** The claim is embedded with Gemini embeddings and searched in Tiger Data (pgvector, with a pgvectorscale diskann index):
   - **Official alerts.** The top matches are listed first, but the matcher always sees *every* official alert, so retrieval never hides one.
   - **Past checks.** The top matches, plus earlier checks of the exact same image or video file.
   - **Trusted evidence only.** A past check is passed to Gemini as evidence only if all three hold:
     - its verdict came from an official alert match or cited sources;
     - its on-chain log re-hashes and verifies;
     - its matched alert is still **Active** (read live from Solana).

   Everything else only counts toward "seen N times". Evidence is context for the matcher. It never sets a verdict.
4. **Verdict rules** (unchanged; see below). Gemini compares the claim with the official alerts. If nothing matches, a Google-Search-grounded check runs, and sources come only from grounding metadata.
5. **Every check is logged on Solana and published to `/ledger`.** After the response, a hash-only SPL memo `crisissignal:check:v1:<checkId>:<sha256>` is signed by the check-log wallet. It contains no text, media or user info. Anyone can press **Verify** to re-hash the stored check and compare it with the chain.

## Verdicts

| Verdict | Meaning |
|---|---|
| ✅ `VERIFIED_OFFICIAL` | Matches an alert registered on-chain by a known agency wallet (exact file hash or same meaning), and that alert is still Active |
| ❌ `CONTRADICTED` | An altered version of a registered alert, a match to a retracted or superseded alert, or credible sources directly contradict it |
| 🔵 `SUPPORTED` | Not registered, but credible sources support it |
| ⚠️ `UNVERIFIED` | No official record and no citable sources. Absence of evidence is never `CONTRADICTED` |

- **Official evidence is required.** `VERIFIED_OFFICIAL` and `CONTRADICTED` always need an official on-chain alert or cited sources. Memory from the ledger alone never decides a verdict.
- **Sources come from grounding metadata only**, never from model text. Social and video platforms (YouTube, TikTok, Facebook, Instagram, X/Twitter, Reddit) are dropped, one source is kept per domain, at most 6. If nothing is left, the claim is `UNVERIFIED`.

## Sponsor tech

| Sponsor | What it does in CrisisSignal |
|---|---|
| **Gemini** | Extracts claims from links, screenshots and video; matches claims against official alerts; runs grounded Google Search with cited sources; and makes the 768-dim embeddings for semantic search |
| **Solana** | Devnet. The `crisis_registry` Anchor program anchors official alerts (with retraction), and SPL memos log every check verdict as a verifiable hash |
| **Tiger Data** | Postgres + TimescaleDB storage: `checks` is a hypertable with `time_bucket()` stats, and pgvector/pgvectorscale (diskann) power semantic search over alerts and the ledger |
| **Auth0** | Log in / Sign up to check claims (with My checks history), and admin login for verified emails on `ADMIN_EMAILS` |

## Pages

| Page | Who | What |
|---|---|---|
| `/` | Everyone | What CrisisSignal is |
| `/check` | Logged-in users | Check text, a link, a screenshot or a video (logged-out visitors get Log in / Sign up) |
| `/result/[id]` | Everyone | Verdict, what you saw vs. what the agency said, extracted claims, "Logged on Solana" + Verify, and evidence from the ledger |
| `/ledger` | Everyone | Public Fake-Claim Ledger: every check, newest first, filterable by verdict and type, with "seen N times" per claim |
| `/alerts` | Everyone | Official alerts with Solana verification, plus live check stats |
| `/my-checks` | Logged-in users | Your own checks |
| `/publish` | Admins | Import live NWS alerts or add an alert manually (demo) |

## Security

- **SSRF-safe link fetching.**
  - Only `http`/`https`, with no credentials in the URL.
  - Every resolved IP must be public. The check runs inside the socket's DNS lookup, so the IP that was checked is the one connected to, with no DNS-rebinding gap.
  - Loopback, private, link-local (including cloud metadata), CGNAT and IPv6 local ranges are blocked.
  - 10 s timeout, 2 MB cap (counted after decompression), at most 3 redirects, each re-checked.
- **Uploads.** Screenshots must be PNG/JPEG/WEBP under 10 MB, and the type is checked from the file's magic bytes, not the browser's claim. Screenshots aren't stored on the server.
- **Redaction.** Public responses never include the user's email or Auth0 id. Emails and phone numbers pasted into checked messages are shown as `[email]` / `[phone]` on the result page, the API and the ledger. The on-chain log holds only hashes.
- **Rate limits.** `POST /api/check` allows 10 checks per user per minute (429 with `Retry-After`).
- **Anti-poisoning rules.**
  - Ledger evidence must have an official basis, a verified on-chain log and a still-Active alert. Failed or slow chain reads count as not trusted.
  - Evidence is context only and can never set a verdict.
  - Gemini prompts treat user content, web pages and past summaries as untrusted data.
  - Only our own limitation lines are shown, never model prose.
- **Devnet only.** The app refuses non-Devnet RPC URLs, and nothing is reported as confirmed unless `sendAndConfirmTransaction` succeeded.
- **TLS-verified database.** The Tiger Data connection always verifies the server certificate, against Tiger's CA (`DATABASE_CA_CERT`).
- **Auth.**
  - **Admin:** `/publish` and the admin APIs (publish, retract, retry, NWS import) need an Auth0 admin session (verified email on `ADMIN_EMAILS`) or the `ADMIN_PASSWORD` signed cookie (timing-safe compare). Without one, the page redirects and the APIs return 401.
  - **Checking:** needs an Auth0 login when Auth0 is configured.
  - **Viewing** is always public.

## Setup

Requires Node.js 20+.

```powershell
npm install
copy .env.example .env.local      # then fill in the variables below
npx tsx scripts/setup-wallets.ts  # generates demo agency wallets, prints secrets for .env.local
npm run dev                       # http://localhost:3000
```

1. **Fund the wallets.** They need Devnet SOL. The RPC faucet is often closed, so fund each pubkey in `config/agencies.json` (and the check-log wallet) at https://faucet.solana.com. Without SOL, alerts are saved as **Not recorded on-chain**; use **Retry on Solana** after funding.
2. **Anchor registry.** Set `REGISTRY_MODE=anchor` and run `setup-registry.ts` once. With `memo`, alerts are recorded as SPL memos instead.
3. **Tiger Data.** Set `DATABASE_URL` and `DATABASE_CA_CERT`, then run `setup-db.ts`. Without `DATABASE_URL`, everything is stored as JSON files in `data/` (gitignored), including embeddings in `data/embeddings.json`.
4. **Auth0.** Create a Regular Web Application and allow `<APP_BASE_URL>/auth/callback` as a callback URL and `<APP_BASE_URL>` as a logout URL. Without `AUTH0_DOMAIN`, there are no user accounts: checking is anonymous and admins use the password.

### Environment (`.env.local`, never committed)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Model for grounded search; needs Search grounding quota |
| `GEMINI_MATCH_MODEL` | Optional model for claim extraction, video transcription and alert matching; defaults to `GEMINI_MODEL` |
| `GEMINI_EMBED_MODEL` | Optional embedding model, default `gemini-embedding-001` (768 dims). Failures are skipped |
| `SOLANA_RPC_URL` | Devnet RPC (the app refuses non-Devnet URLs) |
| `AGENCY_*_SECRET` | Base58 secret keys for the demo agencies, printed by `setup-wallets.ts` |
| `REGISTRY_MODE` | `anchor` (the `crisis_registry` program, recommended) or `memo` (SPL memo only, the default) |
| `REGISTRY_PROGRAM_ID` | Deployed `crisis_registry` program on Devnet |
| `REGISTRY_ADMIN_SECRET` | Registry admin key, printed by `setup-registry.ts` (only that script uses it) |
| `CHECKS_LOG_SECRET` | Optional base58 Devnet key that signs the hash-only check log. Unset = checks aren't logged on-chain |
| `DATABASE_URL` | Optional Tiger Data (Postgres + TimescaleDB) connection string. Unset = JSON files in `data/` |
| `DATABASE_CA_CERT` | Path to Tiger Data's CA certificate (PEM). The certificate is always verified |
| `ADMIN_PASSWORD` | Password for `/admin/login`. Empty = no password login |
| `AUTH0_DOMAIN` | Optional. Turns on Auth0 user and admin login. Unset = no accounts |
| `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | Auth0 Regular Web Application credentials |
| `AUTH0_SECRET` | Encrypts the Auth0 session cookie (`openssl rand -hex 32`) |
| `APP_BASE_URL` | App URL, e.g. `http://localhost:3000` |
| `ADMIN_EMAILS` | Comma-separated admin emails. An Auth0 login is an admin only if its email is verified and on this list |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm run build` | Production build |
| `npm test` | Unit tests: hashing, integrity verification, verdict rules, SSRF and upload checks, redaction, check log, retrieval trust rules, auth gates |
| `npm run lint` | ESLint |
| `npx tsx scripts/setup-wallets.ts` | Generate the demo agency wallets |
| `npx tsx --env-file=.env.local scripts/setup-registry.ts` | One-time Anchor registry setup: fund admin, initialize, register both agencies (safe to re-run) |
| `npx tsx --env-file=.env.local scripts/setup-db.ts` | Tiger Data setup (safe to re-run): tables and the `checks` hypertable, import `data/*.json`, pgvector columns + diskann (or HNSW) index, backfill missing embeddings and claim clusters |
| `npx tsx --env-file=.env.local scripts/import-nws.ts` | Mirror up to 3 live weather.gov alerts, signed by the NWS demo wallet |
| `npx tsx --env-file=.env.local scripts/diag-grounding.ts` | Debug Gemini Search grounding |

## Architecture

Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind, single repo.

```
app/                 pages and API routes
proxy.ts             Auth0 routes (/auth/*), /publish and /my-checks protection
lib/
  hash.ts            sha256 and canonical alert hashing (fixed key order)
  solana.ts          recordMemo / readMemo on Devnet (SPL Memo)
  registry.ts        crisis_registry Anchor client: publish, read, retract, live status
  verify.ts          alert integrity rules (memo and Anchor)
  publish.ts, nws.ts publishing and the live weather.gov import
  gemini.ts          claim extraction, transcription, matching, grounded search
  fetch-page.ts      SSRF-safe link fetching + HTML to text
  embed.ts, rag.ts   Gemini embeddings, retrieval and the trusted-evidence rules
  check-log.ts       hash-only on-chain check log + verify
  ledger.ts, evidence.ts, sources.ts, redact.ts   public projections and display rules
  store.ts           storage: Tiger Data (store-pg.ts, db.ts) or JSON files
  admin.ts, admin-auth.ts, auth0.ts, rate-limit.ts   auth and limits
programs/crisis_registry   Anchor program (deployed via Solana Playground)
config/agencies.json  demo agencies (public keys only)
demo/                 demo inputs, see demo/README.md
```

### API

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/alerts` | Public | Official alerts, newest first |
| POST | `/api/alerts` | Admin | Publish (multipart: `agencyId`, `title`, `body`, optional `video`) |
| POST | `/api/alerts/[id]/retry` | Admin | Re-send the on-chain record for an alert whose transaction failed |
| POST | `/api/alerts/[id]/retract` | Admin | Retract an Anchor-registry alert (demo: server signs with the agency key) |
| GET | `/api/alerts/[id]/verify` | Public | Alert integrity check against the chain |
| POST | `/api/nws/import` | Admin | Import live NWS alerts |
| POST | `/api/check` | Logged in | Check one input (multipart: `text`, `url`, `image` or `video`). 401 without login, 429 over the rate limit |
| GET | `/api/checks/[id]` | Public | One check result (owner removed, contact details redacted) |
| GET | `/api/checks/[id]/verify` | Public | Re-hash the stored check and compare with its on-chain log memo |
| GET | `/api/checks/[id]/evidence` | Public | Earlier checks of the same file or a similar claim (ids, verdicts, similarity, on-chain status only) |
| GET | `/api/stats` | Public | Check totals per verdict, plus hourly counts over the last 24h (`time_bucket()`) |

### On-chain formats

- **Alert hash.** `contentHash = sha256(JSON.stringify({ agencyId, title, body, issuedAt, mediaHash }))`, with keys in exactly that order.
  - **Anchor mode** stores it in an Alert PDA `["alert", agency wallet, contentHash]` with Active / Retracted / Superseded status.
  - **Memo mode** writes `crisissignal:v1:<alertId>:<contentHash>`.
- **Check log.** `crisissignal:check:v1:<checkId>:<sha256>` over `{ checkId, verdict, basis, matchedAlertId, createdAt, inputHash, mediaHash }`, with keys in exactly that order. `inputHash` is the sha256 of the text that was compared, and `mediaHash` the sha256 of the uploaded file.

## Limitations

- **Demo agency wallets.** The agencies are demo wallets, clearly labeled "(demo)" in the app, and the NWS feed is mirrored, not signed by NWS. This is Devnet only. The demo check-log wallet currently reuses the NWS demo wallet.
- **AI matching can make mistakes.** Claim extraction, alert matching and grounded search are done by Gemini. Results show this as a limitation, and the verdict rules keep it conservative (no evidence means `UNVERIFIED`).
- **We verify claims, not pixels.** A screenshot is checked by what it *says*, not by detecting image edits or deepfakes. The integrity check proves an official alert wasn't changed; it doesn't prove claims outside it.
- **Rate limits are in memory.** They're per server process, which is fine for one instance; several instances would need a shared store.

## What's next

- **A `MODIFIED_FROM_OFFICIAL` verdict**, separating "a real alert someone edited" from other contradictions.
- **Real agency onboarding**: agencies register and sign with their own keys, so CrisisSignal mirrors less and verifies more.
- **More feeds**: FEMA IPAWS, USGS earthquakes, state and county emergency management, and utility outage alerts.
