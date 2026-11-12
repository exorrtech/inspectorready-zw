# InspectorReady ZW

**Answer plain questions about the personal data you hold. Get the register and evidence pack a POTRAZ inspector expects.**

A small database-driven tool that turns plain-English answers into a printable **Record of Processing Activities (ROPA)** and an eight-item compliance evidence pack, aligned to **POTRAZ Form DP1** under Zimbabwe's Cyber and Data Protection Act [Chapter 12:07] (2021).

> This tool helps you produce documentation. It is not legal advice, and it does not replace review by a qualified professional.

## What it does

- **Sign up** one organisation per account, with the entity details an inspection asks for.
- **Record processing activities** — whose data, what data, why, lawful basis, recipients, storage, retention and security measures.
- **Flag risk** — sensitive data and cross-border transfers are marked in the register and in the export.
- **Track eight compliance items** — licence, DPO, ROPA, privacy notice, training, breach register, data-subject request register and cross-border authorisation.
- **Export a print-ready pack** — a ROPA table and an evidence summary, printed through the browser's own print engine.

## Demo

- URL: _added after deployment_
- Email: `demo@inspectorready.co.zw`
- Password: `DemoPass123!`

The demo account is read-only. Every organisation, person and detail in the demo data is fictional.

## Stack

- Node.js 24 + Express 5
- PostgreSQL (Neon) with raw SQL, no ORM
- EJS server-rendered templates
- Tailwind via CDN + a small print stylesheet
- `cookie-session`, `bcryptjs`
- Deployed on Render

Only five runtime dependencies. No React, no build step, no PDF library, no uploads, no email service.

### Why these choices

- **`cookie-session` instead of a sessions table** — one less table and one less cleanup job. The session is signed, `httpOnly`, `sameSite=lax`, and `secure` in production.
- **`bcryptjs` instead of native `bcrypt`** — no native build step, so Render deploys cannot fail on compilation. Cost factor 12.
- **Raw SQL with `pg`** — the queries are small, readable and parameterised. No ORM to configure or upgrade.
- **Browser print instead of a PDF library** — `public/print.css` handles A4 landscape, page breaks and hidden navigation. Nothing server-side can break.

## Database

`schema.sql` is the single source of truth. It creates four tables:

- `orgs` — one row per organisation
- `users` — one account per organisation
- `processing_activities` — the ROPA rows
- `compliance_items` — the eight checklist items

`seed.sql` creates the fictional demo organisation and its data. It is safe to re-run: it deletes and recreates only the demo organisation.

Every query is parameterised. Every read and write is scoped by the `org_id` from the signed session cookie, so one organisation cannot see or change another's records.

## Security

- Passwords hashed with bcrypt, cost 12; login compares against a dummy hash when the email does not exist.
- CSRF token required on every state-changing form and checked with `timingSafeEqual`.
- Login rate limited to 10 failed attempts per IP per 15 minutes.
- Demo sessions are read-only; all writes are blocked server-side, not just hidden in the UI.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- EJS escapes output by default.
- Secrets live in environment variables; `.env` is gitignored.

## Run locally

```bash
cp .env.example .env      # add your Neon DATABASE_URL and a SESSION_SECRET
npm install
npm run db:setup
npm run db:seed
npm run dev
```

Open http://localhost:3000.

`DATABASE_URL` should be the Neon connection string. `src/db.js` removes `sslmode` and `channel_binding`, then enables TLS explicitly, because `node-postgres` does not implement `channel_binding`.

## Deploy on Render

1. Create a **Web Service** from this repository.
2. Build command: `npm install`
3. Start command: `npm start`
4. Health check path: `/health`
5. Environment variables:
   - `DATABASE_URL` — Neon connection string
   - `SESSION_SECRET` — long random string
   - `NODE_ENV` — `production`
6. Run `schema.sql` and `seed.sql` once against the Neon database.

## Print / PDF

Open **Export** and choose **Print / Save as PDF**. The print stylesheet sets A4 landscape, repeats table headers, avoids breaking rows across pages and hides the site navigation.

## Licence

MIT
