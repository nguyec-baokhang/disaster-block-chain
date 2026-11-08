# CrisisSignal — MakeUC 2026 Build Plan

> **Did they actually say it?** Source-level provenance for emergency information.

- **Deadline:** Sun Nov 8, 2026, 11:00 AM CST (Devpost **and** the judging Google Form)
- **Team:** 2 people. Kishan = backend (Gemini + Solana + API). Teammate = frontend.
- **Prize targets:** MLH Best Use of Gemini API, MLH Best Use of Solana, Social Issues track (Security track as a bonus).
- **Rule:** everything is written during the hackathon. The concept ("prove it's real" instead of "detect fakes") was inspired by TruChain (Badger Build Fest); no code is reused. Credit this in the Devpost writeup.

---

## 1. The idea in one paragraph

During disasters and outbreaks, fake alerts and twisted versions of real alerts spread faster than anyone can check them. CrisisSignal flips the question from "is this fake?" to **"did the responsible agency actually say this?"** Agencies publish alerts through CrisisSignal; each alert's SHA-256 hash is recorded on Solana in a memo transaction **signed by that agency's wallet**, so anyone can prove who issued it and that it wasn't changed. When the public sees a suspicious message or video clip, Gemini (which can watch video directly) compares it against the registered official alerts. If nothing matches, Gemini falls back to grounded Google Search with real cited sources.

## 2. Verdicts (the core of the product)

| Verdict | Meaning | How we decide |
|---|---|---|
| `VERIFIED_OFFICIAL` | Matches an alert registered on-chain by a known agency wallet | Exact file hash match, OR Gemini says the content is the same as a registered alert |
| `CONTRADICTED` | Conflicts with an official alert, or credible sources contradict it | Gemini says it's an altered version of a registered alert (e.g. "boil water" became "evacuate"), OR grounded search contradicts it |
| `SUPPORTED` | Not registered, but credible sources support it | Grounded search |
| `UNVERIFIED` | No official record, no credible sources | Default. **Absence of evidence is UNVERIFIED, never CONTRADICTED.** |

## 3. Scope

**Must have (MVP)**
1. Publish page: pick a demo agency, enter title + body, optional short video → hash → signed Solana Devnet memo → saved.
2. Alerts feed: list of registered official alerts with agency, time, Explorer link.
3. Check page: paste text OR upload a short video clip (< 20 MB, ≤ ~60 s) → verdict.
4. Result page: verdict badge, summary, matched official alert shown side by side with the submitted content, list of differences, sources (from grounding metadata only), red flags, limitations.
5. Verify-integrity button on any alert: re-hash stored alert, read memo from chain, check signer is a known agency → green or red.

**Stretch (only after MVP works end to end, ideally by ~3 AM)**
- Phantom wallet: agency signs in the browser instead of the backend.
- Check history page.
- Tiny Anchor program via Solana Playground (beta.solpg.io) — no local Anchor toolchain on Windows.

**Out of scope** — deepfake/visual forensics model, IPFS, endorser voting, auth, social feed, real database, URL scraping, deployment (demo on localhost; Vercel can't write our JSON files).

## 4. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind, single repo |
| Icons | lucide-react |
| AI | Gemini via `@google/genai` (model name from env `GEMINI_MODEL`; take the current Flash model from AI Studio docs) |
| Blockchain | Solana **Devnet**, `@solana/web3.js`, `@solana/spl-memo`, `bs58` |
| Hashing | Node `crypto` SHA-256 |
| Storage | JSON files in `data/` (`alerts.json`, `checks.json`) via a tiny `lib/store.ts` |
| Scripts | `tsx` |

```powershell
npx create-next-app@latest . --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*"
npm i @google/genai @solana/web3.js @solana/spl-memo bs58 lucide-react
npm i -D tsx
```

## 5. Environment (`.env.local`, never committed)

```
GEMINI_API_KEY=
GEMINI_MODEL=
SOLANA_RPC_URL=https://api.devnet.solana.com
AGENCY_HAMILTON_EMA_SECRET=   # base58 secret key
AGENCY_NWS_CIN_SECRET=        # base58 secret key
```

`config/agencies.json` (committed, public keys only):
```json
[
  { "id": "hamilton-ema", "name": "Hamilton County EMA (demo)", "pubkey": "<filled by setup script>", "secretEnv": "AGENCY_HAMILTON_EMA_SECRET" },
  { "id": "nws-cin", "name": "NWS Cincinnati (demo)", "pubkey": "<filled by setup script>", "secretEnv": "AGENCY_NWS_CIN_SECRET" }
]
```
Agencies are clearly labeled "(demo)" — we are not impersonating real agencies on-chain.

`scripts/setup-wallets.ts`: generate the two keypairs, print secrets for `.env.local`, write pubkeys into `config/agencies.json`, request a 1 SOL Devnet airdrop for each. If airdrop is rate-limited, use https://faucet.solana.com. **Do this first — the faucet is the most likely 3 AM blocker.**

## 6. Folder structure

```
app/
  page.tsx                 # landing + "Check something" CTA
  check/page.tsx           # paste text / upload clip
  result/[id]/page.tsx     # verdict view
  alerts/page.tsx          # official alerts feed
  publish/page.tsx         # agency publish form
  api/
    alerts/route.ts              # GET list, POST publish
    alerts/[id]/verify/route.ts  # GET integrity check
    check/route.ts               # POST check
    checks/[id]/route.ts         # GET one check result
components/                # VerdictBadge, AlertCard, SourceList, DiffList, ExplorerLink, VerifyButton
lib/
  types.ts                 # SHARED CONTRACT — commit first, change only together
  mock.ts                  # mock data matching types.ts for frontend work
  gemini.ts                # transcribeVideo, matchAgainstAlerts, groundedCheck
  solana.ts                # recordMemo, readMemo, explorerUrl
  hash.ts                  # sha256, canonical alert hashing
  store.ts                 # read/write data/*.json
  agencies.ts              # load config + keypairs
config/agencies.json
scripts/setup-wallets.ts
data/.gitkeep              # data/*.json is gitignored
```

## 7. Shared contract — `lib/types.ts`

**Write and commit this before anything else.** Frontend builds against `lib/mock.ts` until the API is ready.

```ts
export type Agency = { id: string; name: string; pubkey: string };

export type Alert = {
  id: string;                 // "AL-001"
  agencyId: string;
  agencyName: string;
  title: string;
  body: string;
  transcript?: string;        // if a video was attached (Gemini-generated)
  mediaHash?: string;         // sha256 of the uploaded video bytes
  contentHash: string;        // sha256 of canonical alert JSON
  signature: string | null;   // Solana tx signature
  chainStatus: "confirmed" | "pending" | "failed";
  explorerUrl: string | null;
  issuedAt: string;           // ISO
};

export type Verdict = "VERIFIED_OFFICIAL" | "CONTRADICTED" | "SUPPORTED" | "UNVERIFIED";

export type Source = { title: string; uri: string };

export type CheckResult = {
  id: string;                 // "CK-001"
  inputType: "text" | "video";
  inputText?: string;
  inputTranscript?: string;
  verdict: Verdict;
  basis: "exact_hash" | "official_match" | "web_sources" | "none";
  summary: string;            // 1–2 plain-English sentences
  matchedAlert?: Alert;
  differences: string[];      // how the input differs from the official alert
  sources: Source[];          // ONLY from Gemini groundingMetadata
  redFlags: string[];
  limitations: string[];
  createdAt: string;
};

export type VerifyResult = {
  alertId: string;
  localHash: string;
  onChainHash: string | null;
  hashMatches: boolean;
  signer: string | null;
  signerIsKnownAgency: boolean;
  agencyName?: string;
  explorerUrl: string | null;
};
```

## 8. API

| Method | Route | Input | Output |
|---|---|---|---|
| GET | `/api/alerts` | – | `Alert[]` newest first |
| POST | `/api/alerts` | multipart: `agencyId`, `title`, `body`, optional `video` | `Alert` |
| GET | `/api/alerts/[id]/verify` | – | `VerifyResult` |
| POST | `/api/check` | multipart: `text` OR `video` | `CheckResult` |
| GET | `/api/checks/[id]` | – | `CheckResult` |

All route files: `export const runtime = "nodejs";`

## 9. Backend logic

### Hashing (`lib/hash.ts`)
- `contentHash = sha256(JSON.stringify({ agencyId, title, body, issuedAt, mediaHash: mediaHash ?? null }))` — **always build the object with keys in exactly this order** so the hash is reproducible.
- `mediaHash = sha256(videoBytes)`.

### Publish (`POST /api/alerts`)
1. Validate agency exists. Load its keypair from env.
2. If video: compute `mediaHash`; `transcript = transcribeVideo(bytes, mimeType)`.
3. Compute `contentHash`.
4. `recordMemo(keypair, "crisissignal:v1:<alertId>:<contentHash>")` — the **agency keypair is both fee payer and signer**.
5. Save alert with `chainStatus` and signature. If the transaction fails, save with `"failed"` and `signature: null`. **Never show a confirmed badge for an unconfirmed transaction.**

### Solana (`lib/solana.ts`)
- `recordMemo`: `new Transaction().add(createMemoInstruction(memo, [keypair.publicKey]))` → `sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" })`.
- `readMemo(signature)`: `connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })` → find the instruction whose `program === "spl-memo"`; its `parsed` field is the memo string. Signer = account key with `signer: true`.
- `explorerUrl(sig)` = `https://explorer.solana.com/tx/${sig}?cluster=devnet`.

### Verify (`GET /api/alerts/[id]/verify`)
Recompute `contentHash` from stored fields → read memo → parse hash → compare. Check signer pubkey against `config/agencies.json`. Return `VerifyResult`.

### Check (`POST /api/check`)
1. **Video input:** compute `sha256(bytes)`. If it equals any alert's `mediaHash` → `VERIFIED_OFFICIAL`, `basis: "exact_hash"`, done. Otherwise `inputTranscript = transcribeVideo(...)`.
2. **Official match:** `matchAgainstAlerts(inputTextOrTranscript, allAlerts)`.
   - `relation: "SAME"` → `VERIFIED_OFFICIAL`, `basis: "official_match"`.
   - `relation: "ALTERED"` → `CONTRADICTED`, `basis: "official_match"`, fill `differences`.
   - `relation: "UNRELATED"` → step 3.
3. **Grounded fallback:** `groundedCheck(input)` → `SUPPORTED` / `CONTRADICTED` / `UNVERIFIED`, `basis: "web_sources"` (or `"none"` if no sources came back).
4. Save to `data/checks.json`, return `CheckResult`.

### Gemini (`lib/gemini.ts`)

`const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });`

**transcribeVideo** — `contents: [{ inlineData: { mimeType, data: base64 } }, { text: "Transcribe all speech verbatim. Then on a new line starting 'VISUAL:' briefly describe on-screen text, logos, and setting." }]`. Keep clips short; inline requests are limited to roughly 20 MB.

**matchAgainstAlerts** — no tools, so strict JSON is fine: `config: { responseMimeType: "application/json", responseSchema: ... }`. Send the input plus all alerts as `[id] agency | title | body | transcript`. Ask for:
```json
{ "matchedAlertId": "AL-001 or null", "relation": "SAME | ALTERED | UNRELATED", "differences": ["..."], "redFlags": ["..."], "summary": "..." }
```
Prompt rules: `SAME` means same meaning even if reworded or shortened. `ALTERED` means it claims to come from / is clearly based on that alert but changes instructions, locations, dates, severity, or numbers. Otherwise `UNRELATED`.

**groundedCheck** — `config: { tools: [{ googleSearch: {} }] }`. Don't combine with `responseSchema`; ask for JSON in the prompt, strip ```` ``` ```` fences, `JSON.parse` in try/catch (on failure → `UNVERIFIED` with a limitation note). Ask for:
```json
{ "verdict": "SUPPORTED | CONTRADICTED | UNVERIFIED", "summary": "...", "redFlags": ["..."], "limitations": ["..."] }
```
**Sources come only from** `response.candidates?.[0]?.groundingMetadata?.groundingChunks` → `chunk.web.{title, uri}`, deduplicated. Never from model text. If there are zero chunks, the verdict cannot be `SUPPORTED` or `CONTRADICTED` — force `UNVERIFIED`.

## 10. Frontend

Design: dark navy, clean, calm (this is an emergency tool — no flashy gradients). Mobile-friendly.

Verdict colors: `VERIFIED_OFFICIAL` green ✅ · `CONTRADICTED` red ❌ · `SUPPORTED` blue 🔵 · `UNVERIFIED` amber ⚠️ with "Don't share this as confirmed."

Pages, in build order:
1. **/check** — big textarea + "or upload a short clip" + Check button + loading state ("Checking official records…" → "Searching sources…").
2. **/result/[id]** — verdict badge + summary at top; if `matchedAlert`, two columns "What you saw" vs "What the agency actually said" with `differences` highlighted; agency name + Explorer link + VerifyButton; sources list; red flags; limitations; the line *"Integrity check proves the official alert wasn't changed. It doesn't prove claims outside it."*
3. **/alerts** — cards with agency, title, time, chain status, Explorer link, VerifyButton.
4. **/publish** — agency dropdown, title, body, optional video, Publish → shows the signed transaction.
5. **/** — landing: tagline, 3-step explainer (Agencies publish → signed on Solana → public checks), CTA.

## 11. Git workflow

- `main` stays runnable. Branches: `backend`, `frontend`. Merge to `main` at least every ~2 hours.
- Commit `lib/types.ts` + `lib/mock.ts` + scaffold to `main` **first**, then branch.
- `.gitignore`: `.env.local`, `data/*.json`, `node_modules`.
- Changing `lib/types.ts` = tell your teammate first.

## 12. Timeline (CST)

| Time | Kishan (backend) | Teammate (frontend) |
|---|---|---|
| Now → +45 min | Scaffold, `types.ts`, `mock.ts`, push. Wallet setup script, fund both wallets, Gemini key | Pull, landing + layout + VerdictBadge |
| → ~10:30 PM | `hash.ts`, `solana.ts`, `POST/GET /api/alerts` with a real Devnet tx | /check and /result on mock data |
| → ~12:30 AM | `gemini.ts` all three functions, `POST /api/check` | /alerts, /publish, VerifyButton |
| → ~2:00 AM | Verify route, error handling | Swap mocks for real API |
| **~2:00 AM milestone** | **Full flow works: publish → check (text) → verdict → verify** | |
| → ~3:30 AM | Video path, seed demo alerts | Polish, mobile check |
| ~3:30–7:30 AM | Sleep | Sleep |
| 8:00–9:15 AM | Bug fixes, rehearse demo | Screenshots, final UI fixes |
| 9:15–10:30 AM | Record demo video, Devpost text | Judging form, README |
| 10:30–11:00 AM | **Buffer — submitted and form done by 10:45** | |

## 13. Demo script (2–3 min)

1. **Problem (15 s):** fake alerts during a crisis → panic or ignored real warnings.
2. **Publish (30 s):** "Hamilton County EMA (demo)" publishes a boil-water advisory → open the Solana Explorer tx, point at the agency wallet as signer.
3. **Twisted forward (40 s):** paste "URGENT: County says EVACUATE NOW, water is poisoned!!" → **CONTRADICTED**, side-by-side with the real advisory, differences listed.
4. **Real clip (30 s):** upload the short official video clip (re-encoded, so the hash differs) → Gemini watches it → **VERIFIED_OFFICIAL**.
5. **Unknown claim (20 s):** random viral claim → **UNVERIFIED** (or SUPPORTED with real sources).
6. **Tamper (20 s):** edit one character in `data/alerts.json` → Verify turns red.
7. **Close:** "In a crisis the question isn't 'is this fake?' — it's 'did the people responsible actually say this?'"

Prepare demo inputs in `demo/` (text snippets + one short mp4 we recorded ourselves).

## 14. Submission checklist

- [ ] Full flow works on localhost from a clean `npm run dev`
- [ ] At least 2 confirmed Devnet transactions with working Explorer links
- [ ] Video check works with a re-encoded clip
- [ ] Tamper demo turns red
- [ ] README: what it is, setup steps, architecture, `.env.example`
- [ ] Devpost: description, "How we used Gemini" (video understanding, alert matching, grounded search with cited sources), "How we used Solana" (agency-signed memo provenance, on-chain integrity verification), TruChain inspiration credit, screenshots, demo video, GitHub link
- [ ] Opt into MLH Gemini and Solana prizes; select Social Issues track
- [ ] **Judging Google Form submitted**
- [ ] Both teammates officially registered at makeuc.io/registration

## 15. Risks

| Risk | Fallback |
|---|---|
| Devnet airdrop rate-limited | faucet.solana.com, or ask on MLH/MakeUC Discord; fund early |
| Devnet RPC slow / tx fails | Save alert as `failed`, show honestly, retry button |
| Gemini returns bad JSON | try/catch → `UNVERIFIED` with limitation note |
| Video too large | Trim demo clip to ≤ 30 s, 720p |
| Grounded search returns no sources | Forced `UNVERIFIED` — that's correct behavior, say so in the demo |
| Frontend behind | Ship /check, /result, /alerts only; publish via a curl/script |
