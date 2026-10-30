# Teacher App — one tutor, individual student accounts

Arabic (RTL) education management built with Next.js 16, React 19, Clerk, Prisma 7 and PostgreSQL.

## Neon PostgreSQL + Vercel

This project is configured to run on **Neon PostgreSQL**. Runtime queries use the
Neon **pooled** `DATABASE_URL` through the existing `@prisma/adapter-pg`;
Prisma CLI uses `DIRECT_URL` in `prisma.config.ts`. `npm run build`
generates the Prisma client but never runs migrations.

For the exact setup, environment separation, and migration safety, read
[`docs/neon-vercel-setup.md`](docs/neon-vercel-setup.md).

```sh
cp .env.example .env
# Fill .env with the two connection strings from the Neon development branch.
npm ci
npm run db:check
# Only after checking the target is a disposable DEVELOPMENT branch:
npm run db:deploy
npm run dev
```

**Production:** configure separate Neon production credentials as Vercel environment
variables (not in Git). Apply verified production migrations separately, never as
part of `next build`. The parent-data migration is destructive and has not been
verified against real data.

## Roles and privacy
- Exactly one configured teacher account (`TEACHER_EMAIL`) administers the students, groups, timetables, attendance, fees, homework, grades, and classrooms.
- Students have individual `STUDENT` accounts. The teacher explicitly assigns the verified Clerk email to a student's record. Unassigned sign-ins cannot read any student records.
- Students access their own schedule, attendance, payment history, homework and submissions, grades, and classroom sessions.
- There is **no parent role, dashboard, parent account linking, parent phone column, or invitation table** in the new schema.
- `studentPhone` is optional, is for a student's **own** number only, and is empty after the privacy migration. Old phone values are **not** transferred.
- WhatsApp delivery, where configured, uses the student's own contact number.

## Migrating an existing database — DESTRUCTIVE
The migration at `prisma/migrations/20261014000000_student_accounts/migration.sql`:
1. Deletes historical WhatsApp notifications (previously addressed to parent numbers).
2. Deletes checkout orders attached to old parent user accounts.
3. Drops `ParentStudent` and `ParentInvitation` tables.
4. Deletes old `PARENT` users from PostgreSQL and replaces the role with `STUDENT`.
5. Drops the `parentPhone` column **without copying any values**; adds nullable `studentPhone`, `loginEmail` and `userId`.

Academic records (student profiles, group membership, attendance, grades, homework, and payments) are preserved. This cannot scrub parent details someone typed manually into free-text notes or historical backups.

**Important:** The database migration does not delete users from Clerk's own service; remove legacy parent accounts in the Clerk Dashboard/API separately, subject to any applicable retention policies. Delete old backups, exports and local logs that contain parent data according to those policies. Do not assume deleting PostgreSQL rows automatically purges external providers.

Check all affected records, privacy obligations, and backup policy **before** applying this irreversible migration. The branch was edited through GitHub without a local database or runtime validation; run the commands and test end-to-end before merging:

```bash
npm install
npm run db:deploy
npm run db:generate
npm run lint
npm run build
npm run test:students
npm run test:student-portal
npm run test:privacy-migration
npm run test:classrooms
npm run test:classroom-invitations
```

## Student account setup
1. Configure Clerk and `TEACHER_EMAIL` (the one designated tutor) in your local environment.
2. Teacher creates/opens a student profile under `/teacher/students/[studentId]`.
3. Teacher enters the student's **verified sign-in email** in the Account section.
4. Student registers with Clerk using that same email, verifies it, and visits `/dashboard`.
5. Student access is resolved from the authenticated session, not from a student ID parameter. Clearing/change of assigned email revokes the old student account.

Unapproved users see `/account-pending`.

## Features
Teacher: students, groups, attendance, payment records, timetable and rescheduling, homework management, exams and grades, private live/recorded classroom sessions and optional WhatsApp invitations.

Student: personal dashboard, attendance and grades, fees, schedule, homework submission with private attachments, and eligible classrooms.

A classroom invitation is now only a deep link: the recipient must log in as the approved student before seeing private lessons. Old links that were sent to parent phones no longer grant access by themselves. Live video uses peer-to-peer WebRTC and uploads currently use local server disk; assess hosting constraints before production deployment.

## Developer commands

`npm run dev` regenerates Prisma Client before starting Next.js. After changing
`prisma/schema.prisma` while the server is running, run `npm run db:generate`
and restart the development server to replace its cached Prisma client.

```bash
npm run dev
npm run db:generate
npm run db:migrate
npm run db:seed
npm run lint
npm run build
```

Neon pooled and direct development connections are configured in `.env`; Clerk keys and the teacher email can be provided in `.env.local`. Review `.env.local.example` and `docs/neon-vercel-setup.md`.

Next.js gives `.env.local` priority over `.env`, including empty values. If Clerk
reports missing keys when they are already set in `.env`, remove or comment out
empty `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` assignments in
`.env.local`, then restart `npm run dev`. When setting keys in `.env.local`,
uncomment and fill both entries in the example.

Historical migrations contain old table names needed for replaying earlier schema revisions; only the latest migration drops those tables. Do not rewrite already applied migrations on a deployed database.
