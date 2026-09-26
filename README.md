# Ethelius Admin

Internal portal for Ethelius: employees, client companies, projects and assignments, monthly client billing, payments received, payroll, bank credits and payslips — all connected through one relational model.

```
Employee → Project assignment → Project → Company → Monthly invoice → Payments received
Employee → Salary structure (versioned) → Monthly payroll → Bank credit → Payslip
```

## Stack

Next.js 16 (App Router, Route Handlers, `proxy.ts`) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Query & Table · React Hook Form + Zod · Recharts · PostgreSQL 17 + Prisma 7 · Puppeteer (payslip PDFs) · ExcelJS / jsPDF (exports) · Resend (optional email).

## Getting started

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set SESSION_SECRET (see the command in the file)
npm run db:up               # Postgres 17 in Docker on localhost:5433
npm run db:migrate          # apply migrations
npm run db:seed             # realistic demo data (wipes the dev database)
npm run dev                 # http://localhost:3000
```

Demo accounts (password `Ethelius@2026`):

| Email | Role | Sees |
|---|---|---|
| admin@ethelius.com | Super admin | Everything |
| rohan.desai@ethelius.com | Finance admin | Salary, payroll, billing, payments, payslips, reports |
| priya.shah@ethelius.com | HR admin | Employees, documents, assignments, attendance |
| meera.pillai@ethelius.com | Project manager | Projects, assignments, project reports |
| jainish.koladiya@ethelius.com | Employee | Own profile, payslips, documents, expenses |

The seed creates 5 companies (one billing in USD), 15 projects, 20 employees with salary history and project moves, six months of invoices, payments (TDS, partial and overdue cases), attendance, paid payroll and payslips, plus the current month's payroll awaiting approval.

Payslip PDFs are rendered with headless Chrome. If Puppeteer's browser is missing, run `npx puppeteer browsers install chrome`.

## The monthly workflow

1. **Employees** → add the person. 2. **Companies** → add the client. 3. **Projects** → create the project with its monthly billing amount.
4. Employee profile → **Assign project** (allocation %, up to 100% in total). 5. Profile → **Salary** → set or revise the structure.
6. **Monthly billing** → *Generate invoices* for the month (one per billable project; duplicates are blocked).
7. **Client payments** → *Record payment*: amount settled, TDS, other deductions — the bank credit is derived, partial payments are fine.
8. **Attendance** → prefill or adjust the month (LOP days pro-rate earnings).
9. **Payroll** → *Generate payroll* — calculates earnings, PF/PT/ESI from **Settings → Payroll rules**, and each employee's recurring TDS/loan deductions.
10. Review; edit lines on any payroll (manual lines survive recalculation). 11. **Approve** (finance approvers only) — earnings and deductions lock.
12. **Bank payments** → record what was actually credited (can differ from net salary; the difference is shown).
13. **Payslips** → generate, preview, download PDF, print or email. 14. **Reports** → revenue, payments, payroll register and project profitability.

## Business rules enforced

- Salary structures are immutable versions. A revision closes the previous one the day before and adds a `SalaryRevision` record; backdating before an approved payroll is refused.
- Financial records (invoices, payments, payroll, payslips, expenses) are soft-deleted only.
- Invoice amount, expected receivable, TDS/deductions, actual bank credit and outstanding are separate figures. Invoice status (sent / partially paid / paid / overdue) is derived from received payments.
- Calculated net salary and actual bank credit are separate fields.
- Payroll is locked once approved; only bank credit details can be recorded after that.
- Reports aggregate in INR using each invoice's/payment's recorded exchange rate.
- Profitability: revenue − (payroll employer cost × allocation %, pro-rated by days) − approved project expenses, shown both on invoiced ("expected") and received ("cash") revenue.

## Security

- Sessions: random 256-bit token in an HttpOnly, SameSite=Lax cookie; only its HMAC is stored. 12-hour sessions, 14 days with "keep me signed in". Password changes, role changes and deactivation revoke sessions.
- Passwords hashed with bcrypt (cost 12). Login is rate-limited per IP and per email, accounts lock for 15 minutes after 5 failures, and unknown emails take the same time as wrong passwords.
- CSRF: `proxy.ts` rejects cross-origin state-changing API calls.
- RBAC: permissions live in the `Role`/`Permission` tables (editable under **Users & roles**) and are checked in every API handler; services additionally scope data (e.g. employees only see their own records) and redact PII, bank and salary fields for roles without clearance.
- Files are stored outside `/public` (`STORAGE_DIR`, or a private S3 prefix) and served only through authorised routes; viewing identity/bank documents is audited.
- Connections to Amazon RDS are verified against Amazon's CA bundle (`certs/rds-global-bundle.pem`), not just encrypted.
- Every important change is written to the audit log with user, IP, before and after values.

## Project layout

```
prisma/                 schema, migrations, seed
src/app/(app)/          authenticated pages          src/app/api/        REST route handlers
src/app/login/          sign-in                       src/proxy.ts        auth redirect, CSRF, security headers
src/components/ui/      shadcn primitives             src/components/shared/  DataTable, StatCard, GlassCard, forms, pickers…
src/components/layout/  shell, sidebar, search, notifications, theme
src/features/           feature UI + domain logic (payroll calc, payslip template, forms, tables)
src/services/           server-side business logic (one module per domain)
src/lib/                auth, API wrapper, permissions, money/dates, storage, audit, PDF
src/validations/        Zod schemas shared by forms and API
```

## Payslip template

`src/features/payslips/template.ts` is a direct port of the approved salary-slip design (Plus Jakarta Sans, ink/mint/emerald, fit-to-one-A4 script). It renders a standalone HTML document from a `PayslipData` snapshot; preview, print, PDF and email all use it. Colours, sections, signature, footer and numbering (`PAY-2026-09-EMP001`) are configurable under **Settings → Payslip template** with a live preview. Issued payslips store their snapshot, so later changes never alter them unless regenerated.

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Alternative to `DATABASE_URL` (which wins when both are set) — the same variables the marketing site uses |
| `SESSION_SECRET` | ≥ 32 characters, used to HMAC session tokens |
| `STORAGE_DIR` | Where uploads and payslip PDFs are written locally (default `./storage`) |
| `S3_BUCKET_NAME` | Optional — store files in this S3 bucket instead of `STORAGE_DIR` |
| `S3_KEY_PREFIX` | Key prefix inside the bucket (default `ethelius-admin/`) |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 access; omit the keys when running with an instance/task role |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional — enables emailing payslips |

### Deploying on AWS

- **First run on a new database**: `npm run db:deploy`, then `npm run db:bootstrap -- <email> "<full name>"`. That creates roles, permissions, default settings, deduction rules and one Super Admin (password prompted), with no demo data. `db:seed` refuses to run against RDS.
- **RDS**: point `DATABASE_URL` (or `DB_HOST` and friends) at the RDS endpoint, using a database separate from the marketing site's. The app detects `*.rds.amazonaws.com` hosts and verifies the server certificate against `certs/rds-global-bundle.pem` (deploy the `certs/` folder with the app; any `sslmode` in the URL is ignored at runtime). `prisma migrate deploy` uses Prisma's own engine and connects with `sslmode=require` — encrypted, but without CA verification.
- **S3**: the bucket must not be publicly readable under the prefix — payslip keys are predictable (`payslip/2026-09/PAY-2026-09-EMP001.pdf`). If the bucket also serves a public website, restrict its public-read policy to the site's own paths, or use a separate bucket. The IAM principal needs `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::<bucket>/ethelius-admin/*`, plus `s3:ListBucket` on the bucket (without it S3 answers 403 instead of 404 for missing files).

Date-driven alerts (overdue invoices, contracts and projects ending, joiners, leavers) are raised at most hourly when notifications are polled; a cron job hitting any authenticated page works equally well in production.
