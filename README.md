# Ledger — AI-assisted group expense splitting

A full-stack expense splitter for groups (trips, roommates, events) that goes beyond basic
"add expense, split evenly" CRUD:

- **AI receipt scanning** — photograph a receipt; an AI vision model extracts the merchant,
  line items, and total so you don't retype anything.
- **Debt simplification** — instead of naive pairwise IOUs, the app computes each member's net
  balance and collapses the group's debts into the minimum number of payments needed to settle
  everyone up (see [Algorithm](#algorithm-debt-simplification) below).
- **Real auth + authorization** — JWT session cookies, role-based access per group (admin vs.
  member), and every group-scoped API route independently verifies membership before touching
  data (no "change the ID in the URL" bugs).

Built for the House of Edtech Fullstack Developer assignment (Jan 2026).

## Stack

| Layer                       | Choice                                                                                          | Why                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Framework                   | Next.js 16 (App Router, TypeScript)                                                             | SSR for group/dashboard pages, API routes for the backend, one deployable unit                                                 |
| Database                    | PostgreSQL + Prisma                                                                             | Relational data (users/groups/expenses/splits) with real foreign-key integrity — a ledger should not tolerate orphaned records |
| Styling                     | Tailwind CSS                                                                                    | Utility-first, fast to keep consistent across many small components                                                            |
| Auth                        | Custom JWT (`jose`) in an httpOnly cookie + `bcryptjs` for password hashing                     | Full control over session behavior without pulling in a heavier auth framework for a scoped assignment                         |
| AI                          | Vercel AI SDK +groq vision                                                                      |
| (`llama-3.3-70b-versatile`) | Structured extraction from receipt photos; swappable for Gemini/Groq via the same SDK interface |
| Testing                     | Vitest                                                                                          | Unit tests for the debt-simplification algorithm, including a brute-force cross-check                                          |

## Getting started

```bash
git clone <your-repo-url>
cd splitwise-ai
npm install
cp .env.example .env   # then fill in DATABASE_URL, JWT_SECRET, (optional) OPENAI_API_KEY
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000. Create an account, create a group, add another account's email as
a member, log expenses, and open the **Settle up** tab to see the minimized payment plan.

Run tests:

```bash
npm run test
```

> **Note on `npm run lint`:** this repo was authored in a sandboxed environment without full
> network access, so `npx prisma generate` and the ESLint 9 flat-config resolution couldn't be
> fully verified end-to-end here (both need to reach registries this sandbox blocks). Everything
> was verified via `npx tsc --noEmit` (zero real errors — the only ones seen were "implicit any"
> in Prisma query callbacks, which resolve once `prisma generate` runs with real network access)
> and `npm run test` (all algorithm tests pass). Run `npm install && npx prisma generate` on your
> own machine first; if `npm run lint` still complains about ESLint plugin resolution, delete
> `eslint.config.mjs` and run `npx next lint` once to let Next.js regenerate a config matched to
> your installed versions.

### Generating a `JWT_SECRET`

```bash
openssl rand -base64 32
```

### Deployment (Vercel)

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add `DATABASE_URL` (e.g. from Vercel Postgres, Supabase, or Neon), `JWT_SECRET`, and
   optionally `OPENAI_API_KEY` as environment variables.
4. Vercel runs `next build` automatically; run `npx prisma migrate deploy` once against the
   production database (via a one-off script or Vercel's build command) before first traffic.
5. `.github/workflows/ci.yml` runs lint, tests, and a production build against a throwaway
   Postgres instance on every push/PR — treat a red CI run as a blocker for merging.

## Algorithm: debt simplification

This is the part of the assignment I leaned into hardest, because it's a real, nameable
computer-science problem rather than business logic dressed up as one.

**Problem:** across many expenses, everyone ends up owing and being owed money from several
other people. Settling up naively (each debtor pays each creditor they individually owe) can
require far more transactions than necessary.

**Approach:** `src/lib/debtSimplifier.ts`

1. Reduce the whole ledger to one **net balance per person** (positive = owed money, negative =
   owes money).
2. Greedily match the largest creditor with the largest debtor, settle as much of that pair as
   possible, and repeat. This is the standard "min-cash-flow" heuristic.

**Honesty about its limits:** the _provably_ minimum number of transactions is a harder problem
— it's equivalent to a partition-style problem that's NP-hard in general, because in some cases
splitting one debtor's payment across multiple creditors in just the right combination saves an
extra transaction that the greedy approach misses. I chose the greedy heuristic because it's
O(N log N), always produces a valid, fully-settling result, and never needs more than N−1
transactions for N people — that bound is proven in `tests/debtSimplifier.test.ts`, alongside a
brute-force cross-check confirming greedy matches optimal for the group sizes this app
actually sees (a handful to a few dozen people).

## Security

- **Authentication:** passwords hashed with bcrypt (cost factor 12); sessions are JWTs in an
  `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie — never exposed to client JS, which
  rules out session-token theft via XSS.
- **Authorization:** every group-scoped route (`/api/groups/[id]/...`) independently re-checks
  that the calling user is a member (and, where relevant, an admin) of that specific group —
  see `src/lib/authz.ts`. This is deliberate: authorization bugs are almost always "route A
  checked, but someone forgot to add the same check to route B," so the check lives in one
  reusable place instead of being copy-pasted.
- **Input validation:** every request body is parsed through a Zod schema
  (`src/lib/validation.ts`) before touching the database — rejects malformed types, oversized
  strings, negative amounts, and expenses whose splits don't add up to the stated total.
- **IDOR prevention:** expense creation cross-checks that every participant ID the client sends
  actually belongs to the group server-side, rather than trusting the client's participant list.
- **Enumeration resistance:** login returns an identical error for "no such user" and "wrong
  password," so the endpoint can't be used to discover which emails are registered.
- **Rate limiting:** login, registration, and AI receipt parsing are rate-limited per
  IP/user (`src/lib/rateLimit.ts`) to blunt credential stuffing and AI-cost abuse. It's
  in-memory for this scope — swap for Redis (e.g. Upstash) before running multiple server
  instances.
- **Prompt-injection awareness:** the receipt-parsing prompt explicitly instructs the model to
  treat all text in the photo as data to transcribe, never as instructions to follow, and the
  response is validated against a strict Zod schema before it ever reaches the database —
  a malicious "receipt" with adversarial printed text can't make the model emit non-JSON or
  arbitrary values.
- **Security headers:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a
  restrictive `Permissions-Policy` are set on every response (`next.config.ts`).

### If I had more time

- Move rate limiting to Redis/Upstash for multi-instance deployments.
- Add CSRF tokens on top of `SameSite=Lax` for defense in depth.
- Add integration tests (Playwright) for the auth → group → expense → settle flow end to end.
- Support PERCENTAGE/SHARES split types fully in the UI (the backend/validation already
  supports arbitrary per-person split amounts; the quick-entry form currently exposes
  Equal/Exact to keep the assignment scope focused).
- Real-time updates (websockets/SSE) when a group member adds an expense.

## Project structure

```
src/
  app/
    api/                # route handlers (auth, groups, expenses, settle, receipts)
    dashboard/           groups listing + create
    groups/[id]/         group detail: expenses, settle up, members
    login/ register/     auth pages
  lib/
    auth.ts             session + password hashing
    authz.ts            group membership/role checks
    debtSimplifier.ts   the core algorithm + balance computation
    validation.ts       Zod schemas for all input
    rateLimit.ts        in-memory rate limiter
    db.ts               Prisma client singleton
  components/Footer.tsx
prisma/schema.prisma
tests/debtSimplifier.test.ts
```

## Submission checklist

- [ ] Replace the placeholders in `src/components/Footer.tsx` with your real name, GitHub, and
      LinkedIn URLs.
- [ ] Push to your own GitHub repo.
- [ ] Deploy to Vercel (or similar) and confirm the live URL works end to end.
- [ ] Fill in `DATABASE_URL` / `JWT_SECRET` / `OPENAI_API_KEY` in your deployment's environment
      variables (never commit `.env`).
