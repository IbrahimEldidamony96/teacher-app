# Neon + Prisma 7 + Vercel deployment (teacher-app)

## 1. Create isolated environments in Neon
Create a Neon project and use **separate branches or databases** for:
- **development**: test data only, for day-to-day changes
- **production**: real student data; never run experiments or reset/seed it

You can start with a separate empty development branch (not a copy of real
student data). Never copy production personally identifying data to development
without anonymization. Consider protecting the production branch.

In Neon Console -> Project -> Connect, choose **development** and copy two
PostgreSQL URLs for the *same branch/database*: **Pooled** and **Direct**.

Example (FAKE values, do not paste unchanged):

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-dev-abc-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@ep-dev-abc.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Place them in your local `.env` copied from `.env.example`.
Put Clerk variables and `TEACHER_EMAIL` in `.env.local`.

**Security:** Never commit either URL. The tracked example contains placeholders.

## 2. Validate locally and initialize development only

```sh
npm ci
npm run db:check
npm run db:generate
# Only after verifying the target is an EMPTY development database:
npm run db:deploy
npm run dev
```

`db:check` validates URL pairing and endpoints **without connecting** or
printing credentials. It is not a substitute for checking the selected Neon
branch in the console before executing migrations.

For later schema changes, edit `prisma/schema.prisma`. To create new migrations
with `npm run db:migrate -- --name example_change`, configure a **separate
disposable shadow database** through `SHADOW_DATABASE_URL` if required by
Prisma Migrate. The shadow DB is NOT your main development or production branch.

Commit both your schema changes and generated migration files. Use
`npm run db:deploy` on the matching environment **after review**.

## 3. Vercel deployment
Import the GitHub repository into Vercel. Select the intended git branch.
In Vercel -> Project -> Settings -> Environment Variables, configure:

| Name | Value |
| --- | --- |
| DATABASE_URL | pooled URL from production Neon |
| DIRECT_URL | direct URL from the SAME production Neon branch |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk production publishable key |
| CLERK_SECRET_KEY | Clerk production secret |
| TEACHER_EMAIL | verified email of the only teacher |
| CLASSROOM_INVITE_SECRET | stable private high-entropy secret, 32+ chars |
| CLASSROOM_PUBLIC_URL | optional production HTTPS app URL |
| WHATSAPP_* | optional, configure when using notifications |

Use **development Neon URLs in Vercel Preview** (never production database
credentials in untrusted previews). If production contains real student data,
don't branch full production rows into preview without anonymizing.

Vercel build command: `npm run build` (runs `prisma generate && next build`).
No special build script or automatic `migrate deploy` on Vercel.
`npm ci` / `npm install` also runs `prisma generate` through `postinstall`.
The generated client in `src/generated/prisma` is intentionally ignored by Git;
it must be generated on Vercel before Next.js compiles the application.
These variables exist in server-side environments; only
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is publicly exposed.

If the build reports `Module not found` at `src/lib/prisma.js`, verify the
deployment's source branch and commit contain these scripts and set Vercel's
Build Command to `npm run build`. The logs should show `prisma generate` before
`next build`. Create a new deployment from that commit after updating the
settings; retry without the build cache if an older client was cached.
Errors referencing `src/app/parent/...` come from an earlier version: the
`feature/student-accounts-single-teacher` branch uses `src/app/student/...`.

**Before activating production**, apply reviewed migrations to the correct
production database using a separate controlled deploy process with
production `DIRECT_URL`. Never reuse development URLs for production.

## 4. Critical migration warning

`20261014000000_student_accounts/migration.sql` is **destructive**:
deletes legacy parent accounts, invitations and related notification logs,
and drops the old parent-phone column. It has not been applied here.

Test it first against an isolated non-production branch with realistic
**synthetic** data. If actual old parent/teacher records exist, review data
retention and take a compliant backup before the controlled production run.

## 5. Media deployment limitation

Moving PostgreSQL to Neon does not move uploaded homework or lesson videos.
The app currently stores those files on local disk; Vercel functions do not
provide persistent shared storage. Plan a separate object store (e.g. R2,
S3 or Vercel Blob) before relying on production uploads or recordings.

Do not enable `db:seed -- --reset` on a Neon branch with any data you need.
It requires explicit `ALLOW_REMOTE_SEED_RESET=true` for Neon and refuses to
seed with `NODE_ENV=production`.
