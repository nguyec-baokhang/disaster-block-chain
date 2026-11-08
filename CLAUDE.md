# CLAUDE.md — CrisisSignal

Read `PLAN.md` before doing anything. It is the source of truth for scope, the API, and `lib/types.ts`.

## Context
- 24-hour hackathon (MakeUC 2026), deadline Nov 8 11:00 AM CST. Speed and a working demo beat completeness.
- Two devs pair-program on one machine: backend first, frontend after ~1:00 AM.
- Windows / PowerShell environment. Use `npm`, `npx tsx` for scripts.

## Hard rules
- Do not add features outside PLAN.md section 3 "Must have" unless explicitly asked.
- `lib/types.ts` is a shared contract. Do not change it without being told to.
- Secrets live only in `.env.local` and server code. Never import env secrets in client components. Never commit `.env.local` or `data/*.json`.
- Solana: Devnet only. Never report a transaction as confirmed unless `sendAndConfirmTransaction` succeeded.
- Gemini: sources shown to users come ONLY from `groundingMetadata.groundingChunks`. No grounding chunks → verdict is `UNVERIFIED`. Absence of evidence is never `CONTRADICTED`.
- Hash alerts with the exact canonical key order in PLAN.md section 9.
- Don't hardcode a Gemini model name; read `process.env.GEMINI_MODEL`.
- No new dependencies beyond PLAN.md section 4 without asking.

## Workflow
- Small, working increments. After each, run `npm run build` (or the relevant script) and fix errors before moving on.
- Keep components simple: Tailwind, lucide-react, no UI libraries.
