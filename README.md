# ReachInbox Scheduler

A full-stack email job scheduler built for the ReachInbox Software Development Intern assignment: schedule bulk email sends via a dashboard, backed by BullMQ + Redis (no cron), with a PostgreSQL source of truth, Ethereal Email for SMTP, and Google OAuth login.

## Tech Stack

- **Backend:** TypeScript, Express.js, BullMQ (Redis-backed), PostgreSQL via Prisma, Nodemailer + Ethereal Email, Passport (Google OAuth)
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Infra:** Redis + PostgreSQL via Docker Compose

---

## 1. Prerequisites

- Node.js 20+
- Docker Desktop
- A Google Cloud OAuth Client ID/Secret (Web application type)
- An Ethereal Email account (free, instant, at https://ethereal.email)

## 2. Setup

### 2.1 Start Redis + Postgres

From the repo root:
```bash
docker-compose up -d
docker ps   # confirm both postgres and redis containers are Up
```

### 2.2 Backend

```bash
cd backend
npm install
cp .env.example .env
```
Fill in `.env` with your real values:
- `DATABASE_URL` — already correct for the Docker Compose setup above, no change needed
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (Web application). Add `http://localhost:5000/auth/google/callback` as an authorized redirect URI.
- `ETHEREAL_USER` / `ETHEREAL_PASS` — generate at https://ethereal.email ("Create Ethereal Account")
- `SESSION_SECRET` — any random string

Run the migration:
```bash
npx prisma migrate dev
```

Start the API and the worker in **two separate terminals**:
```bash
npm run dev      # Express API on http://localhost:5000
npm run worker   # BullMQ worker process (must run separately — this is what actually sends emails)
```

### 2.3 Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
```
`.env.local` just needs `NEXT_PUBLIC_API_URL=http://localhost:5000` (already the default).

```bash
npm run dev
```
Open http://localhost:3000 — it redirects to `/login`.

---

## 3. Architecture

```
 React/Next.js UI  --REST + cookie session-->  Express API  --BullMQ Queue-->  Redis
                                                    |                            |
                                                    v                            v
                                              PostgreSQL (Prisma)          BullMQ Worker
                                                                                  |
                                                                                  v
                                                                          Ethereal SMTP
```

- The **frontend never talks to Redis or BullMQ directly** — it only calls the Express API.
- **Auth is single-source**: Express (via Passport + Google OAuth) is the only session authority. The frontend has no login system of its own — it just redirects to the backend's `/auth/google` route and, once authenticated, reads the current user from `GET /api/me`. This avoids the complexity/fragility of running two separate cookie-based sessions across two different origins (`localhost:3000` and `localhost:5000`).

### How scheduling works (no cron)

When a campaign is created (`POST /api/campaigns`):
1. One `Email` row is inserted into Postgres per recipient (status `scheduled`).
2. One **BullMQ delayed job** is enqueued per recipient, with a `delay` computed from the campaign's `startTime` + `(index × delayMs)` — this staggers sends according to the "delay between emails" setting, and is what handles the "1000+ emails scheduled at once" case: they all enqueue immediately, but each job's `delay` spaces its actual dispatch out.
3. The job's `jobId` is set to the `Email` row's own UUID.

BullMQ stores all of this inside **Redis**, not in application memory — Redis's own AOF/RDB persistence (via the Docker volume) means the job list survives a Redis restart, and reconnecting workers simply resume watching the same Redis-backed queue. No `setTimeout`, no OS cron, no in-memory timers.

### How persistence on restart is handled

Because BullMQ jobs live in Redis (not in the Node process), killing and restarting `npm run worker` does not lose or re-run anything:
- Jobs still pending fire at their originally scheduled time, exactly once.
- The worker's processor re-fetches the `Email` row from Postgres before sending and checks its status — if it's already `sent` (from a prior run), it no-ops instead of double-sending. This is the idempotency guarantee.
- Setting `jobId = Email.id` explicitly also means BullMQ itself silently rejects a duplicate `add()` call with the same ID, so even an accidental double-submission from the API can't create two jobs for the same email.

This was manually verified during development: schedule an email a few minutes out → kill the worker process → confirm the DB still shows `scheduled` → restart the worker → the email sends at the correct original time, exactly once.

### How rate limiting & concurrency are implemented

- **Concurrency:** `WORKER_CONCURRENCY` (env var) configures how many jobs the BullMQ `Worker` processes in parallel.
- **Minimum delay between sends:** BullMQ's `limiter: { max: 1, duration: MIN_DELAY_MS }` option throttles how fast jobs are pulled off the queue, enforcing a minimum spacing between dispatches (defaults to 2 seconds).
- **Emails-per-hour cap:** implemented as a **Redis `INCR` + `EXPIRE`** counter, keyed by `rate:{senderId}:{year-month-day-hour}`. `INCR` is atomic in Redis, so this is safe even with multiple concurrent worker processes hammering it simultaneously — there's no read-then-write race condition. The cap is per-sender and configurable via `MAX_EMAILS_PER_HOUR_PER_SENDER`.
- **When the hourly limit is hit:** the job is **not failed or dropped**. The worker calls `job.moveToDelayed()` to push it to the start of the next hour window, throwing BullMQ's `DelayedError` to signal this was an intentional reschedule rather than a failure.

**Trade-off noted:** the hourly window is a simple fixed bucket (e.g. "2026-09-25-14"), not a true rolling 60-minute window. This is simpler to reason about and sufficient for this assignment's requirements, but means the actual throughput can briefly spike just after an hour boundary. A production system might use a sliding-window algorithm instead.

---

## 4. Features Implemented

**Backend**
- [x] BullMQ delayed-job scheduler (no cron)
- [x] Restart-safe persistence (Redis-backed queue + DB status re-check)
- [x] Idempotency (deterministic `jobId` + DB status check before send)
- [x] Configurable worker concurrency
- [x] Configurable minimum delay between sends
- [x] Configurable, Redis-backed, per-sender hourly rate limit
- [x] Over-limit jobs rescheduled to next hour window (not dropped/failed)
- [x] Google OAuth login (Passport)
- [x] Campaign creation API with CSV-derived recipient list
- [x] Paginated, filterable email list API (supports multi-status queries, e.g. `sent,failed`)

**Frontend**
- [x] Real Google OAuth login/logout, with user name/email/avatar in the header
- [x] Dashboard with Scheduled / Sent tabs + Compose button
- [x] Compose modal: subject, body, CSV/TXT upload with live recipient count, start time, delay, hourly limit
- [x] Scheduled Emails table (email, subject, scheduled time, status) with loading + empty states
- [x] Sent Emails table (email, subject, sent time, status — includes both `sent` and `failed`) with loading + empty states
- [x] Reusable UI components (Button, Input, Modal, Table, Tabs, StatusBadge)
- [x] Toast-based error handling

## 5. Assumptions & Trade-offs

- A campaign's `Sender` is auto-created per user (one default sender per Google account) rather than requiring separate sender management UI, since the brief allows either global or per-sender rate limiting and doesn't require a full sender-management screen.
- CSV parsing de-duplicates recipient emails within a single upload.
- Cancelling an already-scheduled email is not implemented (not required by the brief; the delete/cancel case was flagged as a bonus, not a requirement).
- The fixed-hour-bucket rate limiter (see above) is a deliberate simplification over a true sliding window.

## 6. Demo Video

_(link here)_
