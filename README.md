# CrisisSignal

> **Did they actually say it?** Source-level provenance for emergency information.

During disasters, fake alerts and twisted versions of real alerts spread faster than anyone can check them. CrisisSignal asks **"did the responsible agency actually say this?"** instead of "is this fake?":

1. **Agencies publish.** An alert's SHA-256 hash is recorded on Solana Devnet in a memo transaction signed by that agency's wallet.
2. **Anyone verifies.** Re-hash the stored alert, read the memo from the chain, and check the signer is the agency the alert claims to be from.
3. **The public checks.** Paste a message or upload a short video. Gemini watches the video, compares the content against registered alerts, and falls back to grounded Google Search with cited sources.

Built at MakeUC 2026. The "prove it's real" concept was inspired by TruChain (Badger Build Fest); no code was reused.

## Verdicts

| Verdict | Meaning |
|---|---|
| ✅ `VERIFIED_OFFICIAL` | Matches an alert registered on-chain by a known agency wallet (exact file hash or same meaning) |
| ❌ `CONTRADICTED` | An altered version of a registered alert, or credible sources directly contradict it |
| 🔵 `SUPPORTED` | Not registered, but credible sources support it |
| ⚠️ `UNVERIFIED` | No official record and no citable sources. Absence of evidence is never `CONTRADICTED` |

Sources shown to users come only from Gemini's grounding metadata, never from model text.

## Setup

Requires Node.js 20+.

```powershell
npm install
copy .env.example .env.local      # then fill in GEMINI_API_KEY and GEMINI_MODEL
npx tsx scripts/setup-wallets.ts  # generates demo agency wallets, prints secrets for .env.local
npm run dev                       # http://localhost:3000
```

The wallets need Devnet SOL to sign memos. If the setup script's airdrop is rate-limited, fund each pubkey in `config/agencies.json` at https://faucet.solana.com. Without SOL, alerts are saved as **Not recorded on-chain**. Use **Retry on Solana** on the alert after funding.

### Environment (`.env.local`, never committed)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Model for grounded search; needs Search grounding quota |
| `GEMINI_MATCH_MODEL` | Optional model for video transcription and alert matching; defaults to `GEMINI_MODEL` |
| `SOLANA_RPC_URL` | Devnet RPC (the app refuses non-Devnet URLs) |
| `AGENCY_*_SECRET` | Base58 secret keys for the demo agencies, printed by the setup script |
| `REGISTRY_MODE` | `memo` (default) or `anchor`: where new alerts are recorded |
| `REGISTRY_PROGRAM_ID` | Deployed `crisis_registry` program on Devnet |
| `REGISTRY_ADMIN_SECRET` | Registry admin key, printed by `setup-registry.ts` (only that script uses it) |
| `DATABASE_URL` | Optional Tiger Data (Postgres + TimescaleDB) connection string, SSL required. Unset = JSON files in `data/`. Run `setup-db.ts` once after setting it |
| `DATABASE_CA_CERT` | Path to Tiger Data's CA certificate (PEM, from the Tiger console). Needed because Tiger signs with its own CA and the app always verifies the cert |
| `ADMIN_PASSWORD` | Password for `/admin/login`; gates `/publish` and the admin API routes (publish, retract, retry, NWS import) |
| `AUTH0_DOMAIN` | Optional. Turns on "Log in with Auth0" on `/admin/login`. Unset = password only |
| `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | Auth0 Regular Web Application credentials |
| `AUTH0_SECRET` | Encrypts the Auth0 session cookie (`openssl rand -hex 32`) |
| `APP_BASE_URL` | App URL, e.g. `http://localhost:3000`. In Auth0, allow `<APP_BASE_URL>/auth/callback` as a callback URL and `<APP_BASE_URL>` as a logout URL |
| `ADMIN_EMAILS` | Comma-separated admin emails. An Auth0 login is an admin only if its email is verified and on this list |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm test` | Unit tests (hashing, integrity verification, verdict rules) |
| `npm run lint` | ESLint |
| `npx tsx --env-file=.env.local scripts/setup-registry.ts` | One-time Anchor registry setup: fund admin, initialize, register both agencies (safe to re-run) |
| `npx tsx --env-file=.env.local scripts/setup-db.ts` | Create the Tiger Data tables (`checks` is a hypertable) and import `data/*.json` (safe to re-run) |
| `npx tsx --env-file=.env.local scripts/import-nws.ts` | Mirror up to 3 live weather.gov alerts, signed by the NWS demo wallet |
| `npx tsx --env-file=.env.local scripts/diag-grounding.ts` | Debug Gemini Search grounding |

## Architecture

Next.js (App Router) + TypeScript + Tailwind, single repo. Data is stored as JSON files in `data/` (gitignored).

```
app/            pages (/check, /result/[id], /alerts, /publish) and API routes
lib/
  hash.ts       sha256 and canonical alert hashing (fixed key order)
  solana.ts     recordMemo / readMemo on Devnet via the SPL Memo program
  registry.ts   crisis_registry Anchor client: publish, read, retract, live status
  idl/          crisis_registry IDL (JSON + TS type)
  verify.ts     integrity rules: local hash, alert ID, signer = claimed agency (memo and Anchor)
  gemini.ts     transcribeVideo, matchAgainstAlerts, groundedCheck
  publish.ts    publish and retry: hash → signed memo or registry record → saved with chain status
  nws.ts        live National Weather Service import
  store.ts      locked read/write of data/*.json
programs/crisis_registry   Anchor program (deployed via Solana Playground)
config/agencies.json   demo agencies (public keys only)
demo/           demo inputs, see demo/README.md
```

### API

| Method | Route | Description |
|---|---|---|
| GET | `/api/alerts` | Registered alerts, newest first |
| POST | `/api/alerts` | Publish (multipart: `agencyId`, `title`, `body`, optional `video`) |
| POST | `/api/alerts/[id]/retry` | Re-send the on-chain record (memo or registry) for an alert whose transaction failed |
| POST | `/api/alerts/[id]/retract` | Agency retracts an Anchor-registry alert (demo: server signs with the agency key) |
| GET | `/api/alerts/[id]/verify` | Integrity check against the chain |
| POST | `/api/check` | Check a message (multipart: `text` or `video`) |
| GET | `/api/checks/[id]` | One check result |
| POST | `/api/nws/import` | Import live NWS alerts |
| GET | `/api/stats` | Check totals per verdict, plus hourly counts per verdict over the last 24h (`time_bucket()` on Tiger Data) |

Memo format: `crisissignal:v1:<alertId>:<contentHash>`, where `contentHash = sha256(JSON.stringify({ agencyId, title, body, issuedAt, mediaHash }))` with keys in exactly that order.

With `REGISTRY_MODE=anchor`, the same `contentHash` is stored in an Alert PDA (`["alert", agency wallet, contentHash]`) of the `crisis_registry` program, which also tracks Active / Retracted / Superseded. Checks read that status live: a match to a retracted or superseded alert is never `VERIFIED_OFFICIAL`.

### Limitations

- Demo agencies are clearly labeled "(demo)". This is Devnet only, with no real agency keys and no auth on the publish page.
- The integrity check proves the official alert wasn't changed. It doesn't prove claims outside it.
- A video's transcript and the alert's `sourceUrl` aren't part of the hash. Alerts edited locally are excluded from checks only when hashed fields or the agency name change.
- Matching against official alerts is done by AI and can make mistakes.
