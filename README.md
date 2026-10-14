# Teacher App

An Arabic, right-to-left application for a private tutor and parents. The teacher manages study groups, students, recurring lessons, attendance, monthly fees, homework, and exam results. Parents see information for the children explicitly linked to their account.

This README contains the code-analysis results and local setup guide. Analysis and setup date: **5 October 2026**. Findings describe the current workspace implementation; the verification section records what was actually run.

## Read these results with a skill

The project-local skill is `.agents/skills/results/SKILL.md`. Enter `/results` in this project's agent conversation to read and summarize this README; `AGENTS.md` defines that project convention.

Codex's supported skill invocation is `$results`, or `/skills` followed by selecting **Results**. If the new skill is missing from the selector, restart the Codex session. The skill reads the current README and distinguishes recorded validation from current runtime status. See the [official skills guide](https://learn.chatgpt.com/docs/build-skills).

Example prompts:

```text
/results
Use $results to explain how to start this project.
Use $results to summarize the outstanding issues.
```

## Current project state

**The teacher application under `src/app/` is now active.** The conflicting starter routes and duplicate Next configuration were preserved in `starter-app/`, and the active TypeScript alias points `@/*` to `src/`.

The development server was verified on **8 October 2026** at **http://localhost:3000**, with an independent page request returning HTTP `200`. Earlier checks found the Arabic landing, sign-in, and sign-up routes returned HTTP `200`; unauthenticated dashboard and teacher-group requests redirected to sign-in. Recorded ESLint and production build checks passed. Student creation now prevents repeated records for the same normalized name and nonblank parent phone; its nine isolated database regression tests passed.

A temporary public HTTPS preview was started for this session at **https://isbn-prediction-pensions-classification.trycloudflare.com**. The launcher configured `CLASSROOM_PUBLIC_URL` in ignored `.env.local`; public sign-in and private student classroom access passed runtime checks. The address requires this computer and the preview processes to remain running. Check `npm run public:status` before treating it as current. WhatsApp credentials are supplied in ignored `.env`; blank `.env.local` overrides were removed. Meta checks verify the configured sending phone belongs to the configured WhatsApp Business Account, and the token grants both `whatsapp_business_messaging` and `whatsapp_business_management`. The user requires automatic group invitations and currently chooses the test sending number. On **8 October 2026**, the Arabic `classroom_invitation` template was verified as `APPROVED`, compatible, and ready. The user subsequently reported five successful invitation sends and zero failures. The group invitation button checks Arabic template approval first and blocks pending templates before student sends or failed-delivery records. Test recipients also require verification through **WhatsApp → API Setup → To → Manage phone numbers**. Recipient delivery receipts were not independently checked; see [the setup guide](docs/whatsapp-setup.md).

On **6 October 2026**, intermittent classroom failures were traced to the local Prisma Dev/PGlite database: concurrent pooled connections produced native PostgreSQL `08P01`, wrapped as Prisma `P2039`. Local loopback PostgreSQL `/template1` connections now use one pooled connection and run standalone queries within transactions, preventing protocol messages from interleaving when development and public preview servers share the database. The classroom suite passed all 15 tests, including separate 96-operation workloads for one and two app clients; pool configuration, interrupted-connection recovery, HTTP failure privacy, and proxy origin checks passed another 15 tests. The production build and focused ESLint checks passed. Both application servers were restarted while preserving the public tunnel address; the named local database service was also restarted without resetting its data. The existing classroom remained available, twelve state reads succeeded, and eight simultaneous authenticated classroom API reads across ports 3000 and 3001 all returned HTTP `200`. Background connection errors now clear after successful polling, while errors from teacher actions remain visible.

The subsequent batch of five WhatsApp invitations completed its database writes with `failed` results; no database timeout was needed to explain those failures. At that stage, read-only Meta requests confirmed that the configured sending ID equaled the token owner's `/me` user ID and the token lacked management access. Both configuration issues have since been corrected. Errors now show safe configuration, recipient, or template guidance in the classroom. Seven mocked provider tests and eleven isolated invitation tests passed, including failure privacy, retry, and concurrent deduplication checks. Focused ESLint and the production build passed. The localhost-only warning now respects the validated public invitation origin. The production preview was updated while preserving its HTTPS address; public sign-in and authenticated read-only classroom requests on ports 3000 and 3001 returned HTTP `200`. No real WhatsApp messages were sent during these checks.

After the user renewed the access token on **6 October 2026**, the latest read-only WhatsApp setup check succeeded: the sending phone belongs to the configured account, and Arabic `classroom_invitation` is compatible but still `PENDING`, with `ready: false`. The application also reached its pending-template guard on the user's retry. Meta approval remains necessary for automatic invitations; no real messages were sent during verification. An earlier check returned HTTP `401`, Meta code `190`, subcode `463` for the expired token; the configuration at that check loaded WhatsApp credentials from ignored `.env` with no `.env.local` WhatsApp overrides. Invitation preparation now stops on a known token rejection before student sends or failed-delivery records, and its Arabic error identifies the environment field and server restart. Optional management-permission failures still permit existing messaging-only integrations. All 22 mocked provider/setup tests and 13 isolated invitation tests passed, including five-student expiry rejection and retry after a fresh successful check. Focused ESLint passed for the two changed source files and two test files. Real delivery remains unverified. Follow [the WhatsApp setup guide](docs/whatsapp-setup.md) for template approval and [token recovery](docs/whatsapp-setup.md#recover-an-expired-access-token).

On **8 October 2026**, the read-only WhatsApp setup check again returned HTTP `401`, Meta code `190`, subcode `463` for an expired token. Safe environment inspection confirmed that all four WhatsApp fields come from `.env`, with no `.env.local` overrides, duplicate assignments, or surrounding whitespace. The setup helper now distinguishes `EXPIRED_ACCESS_TOKEN` from other `INVALID_ACCESS_TOKEN` failures and prints fixed token-renewal and server-restart steps instead of generic permission guidance. All 23 mocked provider/setup tests passed, including credential privacy, stopping before writes, and a retry using a renewed token. After the user saved a fresh token locally, the read-only check succeeded: Arabic `classroom_invitation` is `APPROVED`, `compatible: true`, and `ready: true`. The persistent development server on **http://localhost:3000** reported the `.env` reload and an independent page request returned HTTP `200`. No real WhatsApp messages were sent; external delivery remains unverified.

Focused ESLint passed for the updated WhatsApp setup script and tests. The user's subsequent classroom result reported five sent invitations, zero already sent, zero invalid phone numbers, and zero failures. This confirms successful provider acceptance of that batch; recipient delivery receipts were not independently checked.

On **8 October 2026**, parent invitation failures were traced to the stopped public preview: the previous Cloudflare hostname no longer resolved even though localhost was running. The public preview was restarted at **https://specialist-momentum-helps-indicating.trycloudflare.com** and its configured invitation origin was updated. The launcher now allows 60 seconds for Windows process identification, fixing an observed 15-second startup timeout without weakening ownership checks. Both tracked preview processes are running; a real enrolled participant's invitation set a secure student cookie and opened the classroom, with the page and student API returning HTTP `200`. The production build, focused launcher ESLint, syntax check, and whitespace check passed. Previously sent WhatsApp messages retain their old hostname; renew affected student links with **رابط جديد** before sending the group invitations again. No replacement messages were sent during verification. This temporary address requires the computer and tunnel to stay online.

Completed setup work:

- Installed the declared application dependencies and added the ESLint and TypeScript dependencies required by the configuration.
- Replaced the removed `next lint` command with `eslint .` and approved required package setup scripts in npm's `allowScripts` policy.
- Validated the Prisma schema and generated the client at `src/generated/prisma/`.
- Prepared the initial PostgreSQL migration at `prisma/migrations/20261005000000_init/migration.sql` offline, then successfully applied it to the local development database.
- Defined the seed's missing `DAY` constant. Sample data has not been inserted.
- Moved `ClerkProvider` inside the document body and configured a temporary Clerk development instance in the ignored `.env.local` file. `TEACHER_EMAIL` now matches its verified teacher account; no credentials or personal email are recorded here.
- Started a persistent local development PostgreSQL database named `teacher-app` through the official Prisma 7 CLI. `.env` now points to its plain PostgreSQL main and shadow connections.
- Added duplicate checks, normalized student identity values, inline form feedback, and atomic student creation with optional enrollment. Existing student records and their history were preserved.

Current database verification:

- The original example connection pointed to a PostgreSQL server that was not running, causing Prisma `ECONNREFUSED`. The local service and connection configuration have now been set up.
- `npm run db:deploy` successfully applied the initial migration, creating 13 application tables plus `_prisma_migrations`. A direct Prisma user lookup succeeded and confirmed the teacher account. The app now contains user-entered students, groups, and payment records; the zero-student count recorded during initial setup is historical.
- Actual authenticated browser requests returned HTTP `200` for `/dashboard`, `/teacher/students`, and `/teacher/attendance`. The browser sign-in provisioned the local account through the normal application flow.
- The database is local development data on this machine. Remote PostgreSQL deployment and optional WhatsApp delivery are separate setup tasks.

## Implemented workflows

These features are implemented under the active `src/` application. Authenticated page reads and student-creation regression tests have passed. The remaining integration coverage is described below.

| Area | Teacher | Parent |
| --- | --- | --- |
| Dashboard | Today's lessons, current/next/finished state, attendance counts, monthly payment totals | Linked children's schedule, attendance, payment history, homework, and grades |
| Groups | Create and update groups, assign school level and monthly fee, enroll or remove students | View the groups associated with linked children |
| Students | Create students with duplicate feedback, attach notes and parent phones, link/unlink parent accounts | View only explicitly linked children |
| Weekly schedule | Add/remove recurring sessions, reject tutor schedule overlaps | View weekly lessons |
| Attendance | Record present, absent, late, or excused status; add notes | View recorded attendance and summary |
| Payments | Record/delete partial or full payments and send reminders | View fees, balances, and payment history |
| Homework | Create/delete assignments and record done, partial, or not-done results | View assignments and checked results |
| Exams | Create/delete exams, record scores or exam absence | View results, percentages, and averages |
| Notifications | Trigger configured WhatsApp templates from relevant actions | Receive messages at the student's recorded parent phone |
| Live classrooms | Broadcast video and send the entire group's private WhatsApp invitations with delivery progress | Invited students join through their individual links |

The app records payments made outside the app. It has no payment gateway or online checkout.

## Stack and structure

The manifest declares Next.js `^16.3.6`, React/React DOM `^19.3.0`, Clerk Next.js `^7.9.6`, Prisma `7.10.0`, PostgreSQL via `pg`, and Tailwind CSS 4. Application source is JavaScript; configuration and the preserved starter use TypeScript `^5.9.3`.

```text
starter-app/                 Preserved Create Next App starter; excluded from active routes
src/
  app/
    page.js                  Arabic public landing page
    layout.js                Clerk provider, Arabic localization, Cairo font, RTL
    sign-in/, sign-up/        Clerk authentication screens
    dashboard/               Teacher or parent dashboard based on database role
    teacher/
      actions.js             Validated teacher-only Server Actions
      ui.js                  Shared teacher interface elements
      groups/, students/     Group, enrollment, and student management
      students/create-student-form.js Controlled form and inline duplicate feedback
      schedule/, attendance/ Weekly sessions and attendance entry
      payments/              Monthly subscriptions and reminders
      homework/, exams/      Assignments and exam results
  components/                Weekly schedule and student summary components
  lib/
    auth.js, access.js       User provisioning and access helpers
    student-identity.js      Student name and parent-phone normalization
    prisma.js                Shared Prisma client with PostgreSQL driver adapter
    billing.js               Fee, balance, status, and payment-history calculations
    time.js                  Cairo calendar/time and date validation
    grades.js, labels.js     Grade calculations and Arabic labels
    notify.js, whatsapp.js   Notification deduplication and template delivery
    data/                    Prisma reads/writes organized by domain
  proxy.js                   Clerk authentication context for application routes
  generated/prisma/          Generated client; created by prisma generate
prisma/
  schema.prisma              Models, enums, relations, indexes
  migrations/                Initial PostgreSQL migration and migration lock
  seed.mjs                   Optional development sample data
prisma.config.ts             Prisma CLI configuration, .env, optional shadow database URL
tests/students.test.mjs       Student-creation tests with disposable PostgreSQL
.agents/skills/results/      Skill that reads this README
```

Pages read domain helpers on the server. Forms submit Server Actions; each mutating action checks the teacher role, validates input, calls the relevant data helper, and refreshes affected routes. Classroom API route handlers also enforce session ownership or a valid student invitation for roster access, messaging, live-video signaling, invitations, and video files.

## Routes in the teacher application

| Route | Behavior |
| --- | --- |
| `/` | Public Arabic landing page; signed-in users redirect to `/dashboard` |
| `/sign-in`, `/sign-up` | Clerk catch-all authentication screens |
| `/dashboard` | Role-specific teacher/parent home |
| `/teacher` | Redirect to groups |
| `/teacher/groups`, `/teacher/groups/[groupId]` | Group list and group/enrollment details |
| `/teacher/students`, `/teacher/students/[studentId]` | Student list, profile, parent links, and summaries |
| `/teacher/schedule` | Weekly tutor timetable |
| `/teacher/attendance`, `/teacher/attendance/[groupId]` | Group selection and attendance for a date |
| `/teacher/payments` | Monthly fee and payment overview |
| `/teacher/homework`, `/teacher/homework/[homeworkId]` | Assignment creation/list and student results |
| `/teacher/exams`, `/teacher/exams/[examId]` | Exam creation/list and student scores |
| `/teacher/classrooms`, `/teacher/classrooms/[sessionId]` | Teacher classroom creation, video, invitation delivery, chat, and attendance review |
| `/classroom/[sessionId]` | Student classroom access through a private invitation |

These routes belong to the active `src/app/` routing tree. Authentication pages can render with the configured Clerk development instance; authenticated data access also needs PostgreSQL.

## Authentication and access

Clerk handles sign-in and sign-up. On the first authenticated visit that calls `requireUser()`, the app creates a local `User` identified by Clerk ID.

- A **verified primary email** matching `TEACHER_EMAIL` receives the `TEACHER` role. `ADMIN_EMAIL` is a legacy fallback. Other users receive `PARENT`.
- Set `TEACHER_EMAIL` before that person's first protected visit. Existing roles are persisted; changing the environment variable does not promote an existing parent.
- Teacher data pages and all mutating actions call `requireRole("TEACHER")`; the dashboard calls `requireUser()`. The Clerk proxy establishes authentication context, while these page and action guards enforce protected data access.
- Parent dashboard queries scope children to the authenticated local user's `ParentStudent` links. A phone number does not grant dashboard access.
- Parents must first sign in and visit the dashboard to create their local account. The teacher can then link that parent on a student's detail page.
- Students are managed records and do not have login accounts.

`canViewStudent()` and `assertCanViewStudent()` exist in `access.js` but are currently unused. Domain data helpers do not independently enforce user authorization; their callers must do so.

## Database and business rules

| Model | Purpose |
| --- | --- |
| `User` | Clerk account, email, name, and teacher/parent role |
| `Student` | Student name, school level, parent phone, and notes |
| `ParentStudent` | Explicit many-to-many parent/child access link |
| `StudyGroup` | School level, unique group name, and monthly fee |
| `Enrollment` | Student/group membership, join date, optional fee override |
| `WeeklySlot` | Recurring weekday, start/end times, optional location |
| `AttendanceRecord` | One status per student/group/date |
| `Payment` | Amount, month, method, optional group, timestamp, note |
| `Homework`, `HomeworkResult` | Group assignments and one checked result per student |
| `Exam`, `ExamResult` | Group exams and one result per student; null score means absence |
| `Notification` | WhatsApp delivery attempts, status, reference, and error |

Database uniqueness prevents duplicate parent links, enrollments, daily attendance, and student results for each homework/exam. Attendance and result writes validate group membership and use transactions.

Student creation checks the combination of normalized name and nonblank parent phone. Names use Unicode NFKC normalization, trimmed and collapsed whitespace, and a lowercase comparison. Both the lock identity and existing-record matching use the same JavaScript normalization. Egyptian phone normalization accepts local numbers, `+20`/`0020` prefixes, common separators, and Arabic or Persian digits. Different names may share a parent's number, and the same name may use different numbers. A blank optional phone does not trigger identity deduplication, allowing students with common names to be entered without a phone.

A PostgreSQL advisory lock within a `ReadCommitted` transaction serializes creation of the same identity through the shared helper. A match returns the existing student without changing their details or enrolling them in the newly selected group. A new student and their optional initial group enrollment are created atomically; an invalid group rolls back the new student. The form displays an Arabic duplicate alert and an existing-profile link, preserves entered values, and disables submission while pending. The teacher-role check remains in the Server Action.

This is an application-level identity guard, with no new database unique constraint on student names or phones. Existing duplicate records and their enrollment, attendance, payment, and notification history have not been merged or deleted.

Calendar logic uses `Africa/Cairo`, with Saturday-first week ordering. Date-only values are stored as UTC midnight for the selected calendar day. Future attendance dates are rejected; makeup attendance on an unscheduled day is allowed. Overlapping weekly slots are rejected across all groups because the application models one tutor.

Fees and payments are integer Egyptian pounds. An enrollment contributes its monthly fee from its Cairo join month; its optional override replaces the group fee. Several partial payments can contribute to the same month. Status is paid when payments cover the fee, unpaid when a positive fee is due and nothing was paid, and partial otherwise.

Payment calculations aggregate all a student's groups. A group filter selects students from that group but still displays their combined fees and payments. Historical dues use current fees and current memberships; there are no fee snapshots, enrollment end dates, prorating, credit carry-forward, or immutable invoices.

Attendance percentage counts present and late as attendance, dividing by all recorded statuses. Exam averages exclude absences. Blank, unmarked exam entries remove an existing result.

## Local setup for the teacher interface

Use a Node.js version supported by both the installed Next.js and Prisma versions. Next.js's bundled guide requires at least Node `20.9`; installed Prisma `7.10.0` declares the stricter engine range `^20.19 || ^22.12 || >=24.0`. This session used Node `26.10.0`. PostgreSQL and an appropriately configured Clerk application are needed for protected pages.

1. **Install declared packages.** The teacher routing tree, `src/proxy.js`, source alias, and single active Next configuration are already set up in this workspace.

   ```powershell
   npm install
   ```

   Installation succeeded in this session. The manifest includes ESLint, its Next configuration, TypeScript, and React/Node type packages. npm setup scripts for Prisma, Prisma engines, esbuild, and the ESLint resolver have been approved; Prisma generation succeeded. Sample data has not been seeded.

2. **Configure local environment files.** `.env` and `.env.local` already exist in this workspace. For a fresh checkout, create them from the examples only if they are absent:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item .env.local.example .env.local
   ```

   This workspace's `.env` is already configured for the named local database. To start or restart that database:

   ```powershell
   npm run db:local
   ```

   This uses `prisma dev --name teacher-app --detach`. Its main PostgreSQL port is `51214`, its separate shadow database port is `51215`, and the Prisma local service port is `51213`. The named database runs detached and preserves its local development data across restarts. Use the plain PostgreSQL `DATABASE_URL` and optional `SHADOW_DATABASE_URL` examples in `.env.example`; the app's `PrismaPg` adapter connects directly to PostgreSQL.

   If using an existing PostgreSQL installation or remote database instead, put its connection string in `.env`. For a separate local installation, create an empty database in pgAdmin, or use `psql` if available:

   ```powershell
   psql -U postgres -c "CREATE DATABASE teacher_app;"
   ```

   URL-encode special characters in the connection password. Prisma CLI and seed load `.env` through dotenv. Next.js also reads `.env` at runtime; `.env.local` can override matching variables. `prisma.config.ts` reads `SHADOW_DATABASE_URL` when it is provided for development migrations.

3. **Configure Clerk and the teacher email in `.env.local`.**

   ```dotenv
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY=YOUR_CLERK_SECRET_KEY
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   TEACHER_EMAIL=YOUR_VERIFIED_TEACHER_EMAIL
   ```

   This workspace already has valid keys for a temporary Clerk development instance, kept in the ignored `.env.local` file. `TEACHER_EMAIL` is configured to match the verified teacher account. For another checkout or a permanent deployment, configure the intended Clerk application keys and teacher email before the teacher's first authenticated dashboard visit.

4. **Apply the prepared migration and generate the client.**

   ```powershell
   npm run db:deploy
   npm run db:generate
   ```

   The initial migration already exists at `prisma/migrations/20261005000000_init/migration.sql`. `db:deploy` applies pending migration files to the configured database and needs a running database and suitable permissions. It successfully applied the initial migration to this workspace's new local database. Client generation has also succeeded; generation alone does not create database tables.

   For later schema changes during development, create a new migration with `npm run db:migrate -- --name describe_your_change`; this development command can also require shadow-database permissions.

5. **Start development.**

   ```powershell
   npm run dev
   ```

   Visit `http://localhost:3000`. If the port is occupied, Next prints the actual port. For a chosen port:

   ```powershell
   npm run dev -- --port 3001
   ```

   `npm run dev` runs a database readiness check before starting Next.js. When `DATABASE_URL` points to this project's named local PostgreSQL database (`localhost:51214/template1`, also accepting loopback IP addresses), it starts that database automatically if it is stopped and waits for a successful SQL query. It loads the same development environment files as Next.js, including `.env.local` overrides. Other PostgreSQL connections keep their own startup process. Once the migration has been applied, sign in with the configured teacher account and use `/dashboard` as the main home. Parents sign in separately, then the teacher links their account to students.

   Stop the foreground Next.js server with `Ctrl+C` in its terminal. Stop the detached local database with `npm run db:local:stop`; the next `npm run dev` restarts it. Use `npm run db:local` to start it separately for migrations or other database commands.

### Environment variables

| Variable | Required for | Location |
| --- | --- | --- |
| `DATABASE_URL` | Prisma CLI, generated data layer, protected app data | `.env` |
| `SHADOW_DATABASE_URL` | Optional separate shadow database for development migrations | `.env` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser authentication | `.env.local` |
| `CLERK_SECRET_KEY` | Clerk server authentication | `.env.local` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Custom sign-in route, example value `/sign-in` | `.env.local` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Custom sign-up route, example value `/sign-up` | `.env.local` |
| `TEACHER_EMAIL` | Assigning the teacher's role on first provisioning | `.env.local` |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional WhatsApp sender | `.env.local` |
| `WHATSAPP_ACCESS_TOKEN` | Optional WhatsApp API access | `.env.local` |
| `WHATSAPP_GRAPH_VERSION` | Optional explicit Meta Graph API version | `.env.local` |
| `CLASSROOM_PUBLIC_URL` | Optional public HTTPS app origin for WhatsApp classroom invitations; otherwise uses the public request origin | `.env` or `.env.local` |

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next development server for the active teacher application |
| `npm run predev` | Check and, if needed, start the configured named local database; runs automatically before `dev` |
| `npm run build` | Production build of the teacher application |
| `npm start` | Production server after a successful build |
| `npm run public:start` | Build and run a temporary public HTTPS preview on Windows |
| `npm run public:status` | Show the public preview URL and tracked process status |
| `npm run public:stop` | Stop the tracked public preview and remove its configured URL |
| `npm run whatsapp:setup` | Check configured WhatsApp account, phone ownership, and Arabic invitation template |
| `npm run whatsapp:setup -- --submit` | Submit the prepared invitation template for Meta review when missing |
| `npm run lint` | Run ESLint over the active project |
| `npm run test:students` | Run nine student-creation regression tests in a disposable PostgreSQL instance |
| `npm run test:classroom-invitations` | Verify live classroom invitation permissions, private links, delivery results, retries, and deduplication in disposable PostgreSQL with mocked delivery |
| `npm run db:seed` | Insert optional development sample data into a configured database |
| `npm run db:generate` | Generate `src/generated/prisma` |
| `npm run db:local` | Start the persistent named local development database in the background |
| `npm run db:local:stop` | Stop the named local development database |
| `npm run db:deploy` | Apply the prepared migration files to the configured database |
| `npm run db:migrate -- --name describe_your_change` | Create/apply a later development schema migration |

`test:students` uses the pinned `@prisma/dev` development dependency to start an independent, stateless PostgreSQL instance, applies the initial schema there, and closes the instance after testing. It does not load `.env` or write fixtures to the application's database. Generate the Prisma client before running it in a fresh checkout.

## Optional sample data

The seed's missing `DAY` constant has been repaired. Once run against a configured development database, the seed is intended to create 3 groups, 8 students, 5 weekly slots, 16 attendance records, 5 payments, 6 homework assignments with 8 checked results, and 3 exams with 8 results. One enrollment has a sibling discount. Two placeholder parent accounts have synthetic Clerk IDs and cannot authenticate through Clerk. The seed has not been executed in this session.

```powershell
npm run db:seed
```

A normal seed skips a database that already contains any study groups or students. The seed's creation phase is not one transaction, so an interrupted or failed run can leave an incomplete dataset that a later normal run will not finish. The original undefined-`DAY` bug could also cause this on an older checkout.

`npm run db:seed -- --reset` deletes educational records, notifications, all parent links, and synthetic seed users; real user accounts are preserved. Only use it for disposable development data. The seed refuses to run when `NODE_ENV=production`.

## Optional WhatsApp notifications

The code uses Meta WhatsApp Cloud API template messages with language `ar`. Configure all three WhatsApp variables and approved templates matching these names and ordered body parameters:

| Template | Parameters, in order | Trigger |
| --- | --- | --- |
| `student_absence` | Student name, group name, date | An absent attendance record |
| `payment_reminder` | Student name, formatted month, remaining EGP | Attendance/payment reminder action |
| `homework_assigned` | Student name, homework title, due date | Creating an assignment |
| `exam_grade` | Student name, exam title, score, maximum score | Saving a numeric exam result |
| `classroom_invitation` | Student name, group name, lesson title, private invitation URL | Teacher's group invitation button during a live broadcast |

Egyptian phone numbers are normalized to digits with country code `20`. Missing phones or WhatsApp settings produce `skipped_no_phone` or `skipped_not_configured` logs; network/API failures produce `failed`. Successful attempts produce `sent`.

Only earlier `sent` records suppress retries. Automatic payment reminders are once per student/month; a manual reminder can force another attempt. A previously notified exam result does not send again after score edits. Each API call has an eight-second timeout. Saving actions await notification attempts using `Promise.allSettled`; delivery failure is isolated from the educational data save.

Attendance, payment, homework, and exam notification deduplication uses a read-before-send check with a nonunique database index, so concurrent requests can send duplicates. There is no delivery webhook, background queue, scheduled billing job, or notification-management screen.

### Invite the group during a live lesson

Once the teacher starts the camera and the live session is connected, **إرسال دعوات واتساب لكل طلاب المجموعة** appears beside the microphone control. It refreshes the group roster and sends each currently enrolled student's private invitation to their saved parent phone. Students added after the classroom was created are included; students removed from the group are excluded. Siblings sharing a parent phone still receive distinct links.

Before the button prepares the roster for sending, it reads the Arabic invitation template's current approval status when the account ID and management access are available. Known pending, rejected, missing, paused, disabled, or deleted templates stop preparation with a fixed Arabic explanation. An unavailable management read preserves existing messaging-only integrations, which receive the usual safe send diagnostics. Each new preparation reads fresh status; once Meta approves the template, the same group button proceeds normally.

Delivery uses batches of up to five students, with a progress count and individual delivery results in the invitation roster. Missing or invalid numbers are skipped, and one failed delivery does not stop the remaining students. Clicking again skips successfully recorded deliveries and retries failed ones. Provider failures show a fixed, actionable Arabic message and retain only numeric Meta diagnostics; raw provider messages, phone numbers, tokens, and private links are not included in errors. A separate advisory lock per invitation prevents overlapping requests from sending the same invitation at once; rotating a student's invitation permits sending the new link. These transactions hold the database connection during the provider request, so slow sends can delay classroom polling or exceed checkout waits with the local single-connection database. As with any external send followed by a database write, a crash after provider acceptance can leave delivery uncertain. A `sent` result means the provider accepted the message; there is no delivery-receipt webhook.

Configure the three WhatsApp variables above and approve the Arabic `classroom_invitation` template with the four ordered body parameters. Invitations must point to the application's public HTTPS origin. When opening the teacher interface via localhost, set `CLASSROOM_PUBLIC_URL` to that public origin, for example `https://teacher.example.com`; this setting does not publish the application. The local-only warning is hidden when the teacher's invitation links have a validated configured public origin. Without an override, a public HTTPS request origin is used. Local addresses, credentials, paths, query strings, and fragments are rejected. This workspace's sending phone and account relationship are verified, and both WhatsApp token permissions are present. The October 8, 2026 setup check found the created template compatible with status `APPROVED` and `ready: true`; the user subsequently reported five successful invitation sends with no failures. Meta `131030` requires adding and verifying the intended recipient through **WhatsApp → API Setup → To → Manage phone numbers** in the test sender's Meta dashboard. Recipient delivery receipts were not independently checked.

Follow [the WhatsApp setup guide](docs/whatsapp-setup.md) to create the Meta account, approve the Arabic template, and obtain the three credentials. Account login and phone verification must be completed in your Meta dashboard. Until then, each student's **نسخ الدعوة** control lets you copy their private link and share it manually. With `CLASSROOM_PUBLIC_URL` configured, both copied invitations and **فتح الدعوة** use that public address, including from the local teacher interface.

The prepared API payload is [whatsapp-classroom-template.json](docs/whatsapp-classroom-template.json), with four positional body parameters and fictional sample values. The setup command additionally needs `WHATSAPP_BUSINESS_ACCOUNT_ID` in `.env.local`. It checks the configured sending phone belongs to that account before checking or submitting the Arabic template. Default execution reads account/template state; `--submit` creates a missing template for Meta review and preserves existing templates. Neither command sends student messages. Meta controls approval and final template categorization.

### Temporary public HTTPS for the local app

The Windows preview launcher uses a separate production Next.js server at `127.0.0.1:3001` and a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Your development server can continue on port 3000. The application uses the existing local database and files.

```powershell
npm run public:start
npm run public:status
```

`public:start` checks the local database, builds the app, starts the tunnel, writes its actual HTTPS origin to `CLASSROOM_PUBLIC_URL` in ignored `.env.local`, and starts the production server with that value. It reports success only after the local and public homepages respond. If you have already built the current source, use `npm run public:start -- --skip-build`. Running start again reuses a healthy tracked preview.

Keep the computer online and the preview running during the lesson. A stopped or restarted tunnel invalidates its previous hostname; copy or send new invitation links after restarting. This is a temporary testing address, with no uptime guarantee or permanent domain. Clerk sign-in on the public address uses a separate browser session from localhost.

```powershell
npm run public:stop
```

Stop removes the URL only if it still matches the preview's recorded address. Process identity checks restrict stopping to the launcher's own production server and tunnel. Runtime state and logs are stored at `%LOCALAPPDATA%\teacher-app\public-preview`. The launcher expects the Windows `cloudflared.exe` binary at `%LOCALAPPDATA%\teacher-app\tools\cloudflared.exe`; this workspace's installation was downloaded from Cloudflare's official GitHub release and checked against the release's SHA-256 digest.

Classroom API mutations accept the exact configured public origin through the proxy and still reject foreign or cross-site requests. Invitation redirects use only that configured public origin when the request's URL or host matches it; direct localhost invitations keep their local redirect and cookie origin.

The migration `20261005020000_classroom_invitations` adds the `CLASSROOM_INVITATION` notification type. Apply it with `npm run db:deploy` and regenerate the Prisma client with `npm run db:generate` when installing these changes elsewhere.

## Known limitations and follow-up work

1. **Local development lifecycle:** local PostgreSQL and the teacher email are configured, the migrations have been applied, and authenticated page reads work. `npm run dev` now checks and automatically starts the configured named local database. Direct `next dev` commands bypass this npm hook; use an appropriate remote PostgreSQL connection for deployment.
2. **Clerk ownership:** this workspace uses a temporary development instance. Associate or replace it with the intended Clerk application before permanent use or deployment.
3. **Historical billing:** membership/fee changes can recalculate past amounts. Add enrollment periods and fee snapshots before relying on immutable historical accounting.
4. **Existing student duplicates:** new submissions through the shared creation helper are guarded, but previously duplicated records remain with their history. There is no student-identity unique constraint, and direct database writes or imports can bypass the helper. Students without a parent phone are intentionally not deduplicated by name alone.
5. **Concurrency:** schedule conflict checks and attendance/payment/homework/exam notification deduplication have races under simultaneous requests. Classroom invitations use a dedicated advisory lock per invitation to serialize overlapping sends.
6. **Management coverage:** no student-edit or group/student-delete interface; fee overrides are set when creating an enrollment.
7. **Seed recovery:** creation is not atomic. A failed or interrupted development seed needs deliberate recovery rather than assuming a normal rerun will finish it.
8. **Integration coverage:** nine automated student-creation tests and twelve classroom-invitation tests pass in isolated databases; invitation transport is mocked. Ten provider approval/failure/privacy tests and nine pure public-origin tests passed. Browser sign-in rendering, public private-invitation access, account provisioning, direct Prisma user reads, and selected authenticated pages have passed. End-to-end form submission, parent isolation, other educational data mutations, seed execution, and real notification delivery remain unverified.

## Verification from this session

- Reviewed routes, shared components, teacher actions, authentication and access, all domain data helpers, billing/time/grades, Prisma schema/config/seed, and notification delivery.
- Read the installed Next.js guides before determining routing precedence, alias requirements, and the removed lint command.
- Checked dependency presence and local settings without exposing secrets.
- Created the project-local `results` skill and linked it to this README.
- Initial dependency installation completed. The original `next lint` command failed, and the original root starter returned HTTP `200` with title `Create Next App`. Those findings led to the startup fixes; they do not describe the current application.
- Activated `src/app/`, preserved the starter in `starter-app/`, corrected the source alias and starter exclusion, moved `ClerkProvider` inside the body, and consolidated the active Next configuration.
- Replaced lint with `eslint .`, declared its dependencies and type packages, added `db:generate`/`db:migrate`/`db:deploy`, and approved the relevant npm package setup scripts.
- Repaired the undefined `DAY` constant in the seed. `prisma validate` and client generation passed; generated-client import and syntax checks using tsx passed.
- Provisioned a temporary Clerk development instance through the installed SDK because the Clerk CLI failed on Windows. Kept its credentials and claim metadata in ignored local files. `TEACHER_EMAIL` now matches the verified teacher account.
- The initial example database connection failed with Prisma `ECONNREFUSED` because no PostgreSQL service was listening there. Started the persistent `teacher-app` local database using the official Prisma 7 CLI, added `db:local`/`db:local:stop`, and updated `.env` with the plain PostgreSQL main and shadow connections.
- The local service uses ports `51213` (Prisma service), `51214` (main PostgreSQL), and `51215` (shadow PostgreSQL). This is local development data, not a remote PostgreSQL connection.
- Generated the initial migration offline at `prisma/migrations/20261005000000_init/migration.sql`, plus the migration lock file. The SQL defines 13 tables, 7 enums, 23 indexes, and 16 foreign keys. The new local database initially had no public tables; `npm run db:deploy` successfully applied `20261005000000_init`.
- A direct Prisma `user.findUnique` query succeeded. Initial database inspection confirmed 14 public tables (13 application tables plus `_prisma_migrations`), a completed migration, one user with role `TEACHER`, zero groups, and zero students. Those initial record counts are historical: the user has since entered students, groups, and payments. Their authenticated browser visit provisioned the account normally; the agent inserted no account or seed fixtures into the application database.
- After restarting Next.js with the local database settings, its request logs recorded authenticated HTTP `200` responses for `/dashboard` (twice), `/teacher/students`, and `/teacher/attendance`.
- Resolved ESLint's TypeScript 7 parser incompatibility by using TypeScript `^5.9.3`, escaped JSX quotes, and removed three unused imports. Final `npm run lint`, repeated after the database setup repair, passed with zero errors and warnings.
- Replaced deprecated Clerk proxy routing with `clerkMiddleware()` while preserving page/action authorization guards. Final `npm run build`, repeated after the database setup repair, passed with TypeScript 5.9 and listed 18 routes.
- Started `npm run dev -- --hostname localhost` at `http://localhost:3000`. Final anonymous requests to `/`, `/sign-in`, and `/sign-up` returned HTTP `200` with the Arabic application title and no starter screen. Unauthenticated `/dashboard` and `/teacher/groups` requests returned HTTP `307` redirects to `/sign-in`.
- Validated the skill frontmatter, description, absence of scaffold placeholders, and relative README reference. Python is unavailable locally, so the bundled Python skill validator could not be used; these checks were performed with PowerShell instead.
- An independent read-only review confirmed the README's data, billing, authentication, seed, and notification findings, and the skill's README reference.
- Investigated repeated student creation without exposing names, phone numbers, or emails. A diagnostic snapshot found four existing duplicate student records linked to four enrollments, four attendance records, and nine notification logs. These records and their history were preserved; the fix prevents further matching submissions through the creation helper.
- Verified normalized name/phone matching, legacy duplicate detection, atomic initial enrollment, and concurrent creation in `tests/students.test.mjs` with `tsx --test` (the command configured by `npm run test:students`): nine tests passed, zero failed, in approximately 45 seconds. Five simultaneous matching submissions created exactly one student. Tests also covered siblings, different phone numbers, blank optional phones, preserved legacy enrollment/payment history, no extra enrollment on a duplicate, rollback for an invalid group, and Unicode whitespace/case consistency with FEFF, Greek names, and dotted I.
- The regression suite used an independent stateless database. No fixtures were written to the user's application database. After the final duplicate and Unicode fixes, `npm run lint` passed with zero errors/warnings and `npm run build` passed with all 18 routes. Runtime requests confirmed `/sign-in` returned HTTP `200` and unauthenticated `/teacher/students` returned HTTP `307` to `/sign-in`.
- The development process was launched for this session. To run it again later, run `npm run dev` from the project directory; its startup hook now starts the configured named local database when needed. A later `/results` invocation must check the processes before claiming they are still running.
- Selected authenticated page reads, normal account provisioning, and isolated student-creation regressions passed. End-to-end form submission, parent isolation, other educational data mutations, seed execution, and WhatsApp delivery remain unverified. Seed sample data has not been inserted into the application database.
- Investigated the classroom page's Prisma `user.findUnique()` runtime error and reproduced `ECONNREFUSED` on both loopback addresses at port `51214`: the named local database was stopped. Restarted the existing database and verified the exact user lookup succeeds; both the initial and classroom migrations are applied.
- Added the npm `predev` database readiness/startup hook. Verified a running database is reused, a stopped database restarts successfully, and existing user, student, group, payment, and classroom record counts are preserved. Remote connections and custom local database configurations skip management. A bounded retry handles a daemon still releasing resources after stopping, and startup failure details redact database URLs.
- For this recovery, the full ESLint check passed, the final startup script passed its focused ESLint check, and package manifest/lockfile dependency consistency passed. Development startup instructions above now use `npm run dev` alone for the configured named local database.
- Added the live teacher's group WhatsApp invitation button, refreshed enrollment preparation, five-student batches, delivery progress/results, and invitation-specific send deduplication. Applied the additive `20261005020000_classroom_invitations` migration to the local application database and regenerated the Prisma client.
- For the invitation feature, full ESLint and the production build passed. `npm run test:classroom-invitations` passed all ten tests (zero failures) in approximately 48 seconds against disposable PostgreSQL and mocked WhatsApp delivery. These checks cover ownership, active/live/current-connection restrictions, public HTTPS origins, enrollment changes, distinct private sibling links, skipped numbers, partial failures, retry/deduplication, concurrent sends, invitation rotation, and batch validation. The new test file also passed its focused ESLint check. No real WhatsApp messages were sent; actual delivery remains dependent on the documented external setup.
- Added the Windows public preview launcher and `public:start`/`public:stop`/`public:status` commands. Installed Cloudflare's official `cloudflared` Windows binary, verified its release SHA-256 digest, and started a separate production server at `127.0.0.1:3001` through a connected HTTP/2 Quick Tunnel. The launcher waits for public/local homepage success, preserves existing environment credentials, restores URL assignments on failed startup, and records process identities before stopping its own helpers.
- Reproduced a failed first startup: Clerk's automatic rewrite targeted `https://localhost:3001`, causing `EPROTO` against the internal HTTP server. The startup failure cleaned up both tracked processes and restored the previous URL configuration. Updated `src/proxy.js` to continue locally only for Clerk's rewrite equal to the incoming URL, retaining auth request headers and real redirects. The final production build passed; full ESLint passed before this localized proxy change, and focused proxy ESLint passed afterward.
- Ran the invitation and public-origin suites together: 19 tests passed, zero failed (10 disposable-database invitation tests plus 9 pure origin tests). Verified exact public-origin acceptance, foreign/cross-site rejection, constrained forwarded hosts, public invitation redirects, local cookie origins, and absolute public teacher copy/open links. Launcher syntax and focused ESLint checks passed.
- Public runtime probes returned HTTP `200` for the landing and sign-in pages, `307` from an anonymous dashboard to public `/sign-in`, and `307` from an invalid invitation to the same public HTTPS classroom origin. An unauthenticated POST with the configured Origin reached the expected `404` actor rejection; a foreign Origin returned `403`.
- Used an existing enrolled participant for read-only invitation verification: the private link set a Secure/HttpOnly cookie, redirected without the token, loaded the student classroom with HTTP `200`, and returned student API state with HTTP `200` and no teacher roster. Teacher state generated public HTTPS copy links; a direct localhost invitation retained its localhost redirect and cookie. No educational records or invitation nonces were changed.
- A fresh isolated headless Edge browser rendered Clerk's public sign-in controls with Clerk loaded, no fatal JavaScript errors, no failed network requests, and no internal HTTPS errors. No sign-in was submitted. One nonblocking console resource `404` appeared. Both tracked public preview processes were running in the final status check. WhatsApp account setup and real delivery remain unverified; no messages were sent.
- Prepared the API-compatible Arabic `classroom_invitation` template draft with four positional body parameters and fictional examples. Added `npm run whatsapp:setup` for account/phone/template checks and explicit `-- --submit` for creating a missing template for Meta review. Existing templates are preserved; provider errors and credential values are not printed. The helper sends no student messages.
- Eleven mocked setup tests passed with zero failures, and focused ESLint passed. Checks cover missing/invalid configuration, approved and pending templates, explicit submission, phone/account mismatch, incompatible templates, bounded pagination on the known Graph endpoint, and redacted provider/network failures. The initial live CLI check returned `MISSING_CONFIGURATION` for the four required fields before making any request; that result predates the supplied credentials.
- Corrected the WhatsApp sending phone configuration and removed a duplicate account assignment in ignored `.env`. Meta checks verified the phone belongs to the configured WhatsApp Business Account and the token grants both required WhatsApp permissions. Created the Arabic `classroom_invitation` template, then restarted the tracked production preview while preserving its HTTPS address. The latest setup check returned `PENDING`, `compatible: true`, and `ready: false`. The latest user-reported invitation failure is Meta `131030`, requiring recipient verification in the test sender's Meta dashboard; successful real delivery remains unverified.
- The user chose automatic delivery for the whole group while continuing with the test sender. Read-only Meta checks found the test account review approved, `hello_world` approved, and Arabic `classroom_invitation` still pending. Added fresh template approval inspection before the group invitation preparation, with fixed pending/rejected/paused/missing explanations and optional management access. Twelve isolated invitation tests and ten mocked provider tests passed, including stopping before sends or failure records while pending and proceeding after a mocked approval. Focused ESLint and the production build passed. Updated the tracked production preview without changing its address; public sign-in returned HTTP `200`. The final setup check still returned `PENDING`; actual delivery remains unverified.
