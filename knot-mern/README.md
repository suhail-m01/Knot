# Knot (MERN)

Knot is a hyperlocal event discovery and participation app for Bengaluru neighbourhoods. This is a MERN rebuild of the original Knot app:

- **M**ongoDB (Mongoose models, transactional seat claims)
- **E**xpress 5 (REST API, rate limits, validation, static hosting in production)
- **R**eact 19 (Vite, React Router, TanStack Query)
- **N**ode.js 22 (server runtime, background jobs)

Additional tools: Socket.IO for live notifications and seat counts, Zod for validation, Leaflet for maps, qrcode.react for passes, JWT with bcryptjs for auth, pino for logs, helmet and express-rate-limit for hardening, node-cron for jobs, and tests on the built-in Node test runner with supertest.

## What it does

- **Discover**: search by place, interest, or free text. Results are sorted by distance (10 km radius by default) or by date. Online events appear in every radius search.
- **Event pages**: live seat counts, waitlists, map, IST times, price shown as stated ("Price not stated" when unknown), calendar export (`.ics`).
- **Register natively**: seats are claimed with a conditional database update, so the last seat cannot be oversold. Overflow goes to a waitlist in arrival order. A cancellation promotes the next waitlisted person. Each registration gets a private pass (QR code and short code), and check-in is recorded once.
- **External handoff**: events registered on another site show a "Continue to registration" link. Opening it is a handoff, never a Knot registration.
- **Plan**: upcoming registrations, passes, saved events, and an `.ics` export per event.
- **Notifications**: in-app only, delivered live over Socket.IO, with a notification for registration, waitlist, cancellation, reschedule, and reminders.
- **Organizers**: publish, edit, and cancel events. Track attendees, check people in by QR or code, export attendees as CSV (formula-injection safe), and message attendees. Material changes to time or venue notify registered people. Schedule conflicts are flagged.
- **Admins**: platform totals, role changes, and event takedowns.

## Requirements

- Node.js 20.19 or newer (tested on 22)
- MongoDB 6 or newer, running locally or as Atlas

## Run it locally

```bash
cd knot-mern

# 1. Configure
cp .env.example .env          # edit MONGODB_URI and, for production, JWT_SECRET

# 2. Install
(cd server && npm install)
(cd client && npm install)

# 3. Seed demo data (drops and recreates the database when --reset is used)
(cd server && npm run seed:reset)

# 4. Start the API (port 5000) in one terminal
(cd server && npm start)

# 5. Start the web app (port 5173) in another terminal
(cd client && npm run dev)
```

Open http://localhost:5173. Vite proxies `/api` and `/socket.io` to the API, so the browser never needs the API address.

### Production build

```bash
(cd client && npm run build)   # writes client/dist
(cd server && NODE_ENV=production JWT_SECRET=<long-random> npm start)
```

In production the API also serves `client/dist` from the same origin on port 5000.

### Tests

```bash
(cd server && npm test)
```

Tests use `TEST_MONGODB_URI` (default `mongodb://127.0.0.1:27017/knot_test`). They cover geo search, ICS, CSV safety, the race for the last seat, waitlist promotion, check-in, age gates, handoffs, draft visibility, reschedule and cancel notifications, admin role changes, and reminders sent exactly once.

## Demo accounts

Created by `npm run seed:reset`:

| Role        | Email                   | Password        |
| ----------- | ----------------------- | --------------- |
| Admin       | admin@knot.local        | Admin@12345     |
| Organizer   | organizer@knot.local    | Organizer@123   |
| Community   | community@knot.local    | Community@123   |
| Participant | participant@knot.local  | Participant@123 |
| Participant | student@knot.local      | Student@12345   |

The seed also loads 40 Bengaluru localities, 11 events (native, external, online, and past examples), and sample registrations. These passwords are for local development only. Change them before any shared deployment.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | server | MongoDB connection string |
| `PORT` | server | API port (default 5000) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | server | Token signing (secret is mandatory in production) |
| `CLIENT_ORIGINS` | server | CORS allow-list |
| `PUBLIC_URL` | server | Base URL used in links |
| `ENABLE_JOBS`, `JOB_CRON` | server | Background jobs and schedule |
| `RATE_LIMIT_MAX` | server | Requests per 15 min on `/api` |
| `LOG_LEVEL` | server | pino log level |
| `API_URL` | client (dev/preview) | Where Vite proxies `/api` and `/socket.io` |
| `VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION` | client | Map tile source and attribution |

## API overview

All routes are under `/api`:

- `GET /health`
- `/auth`: `POST /register`, `POST /login`, `GET /me`
- `/users`: `PATCH /me`, `GET /me/plan`, `PUT|DELETE /following/:userId`, `GET /organizers/:id`
- `/localities`: `GET ?q=`
- `/events`: `GET` (discover), `GET /recommended`, `POST`, `GET|PATCH /:id`, `POST /:id/cancel`, `GET /:id/ics`, `POST /:id/handoff`, `POST|DELETE /:id/register`, `PUT|DELETE /:id/save`
- `/organizer`: `GET /events`, `GET /stats`, `GET /events/:id/attendees`, `GET /events/:id/attendees.csv`, `POST /events/:id/checkin`, `POST /events/:id/announcements`
- `/notifications`: `GET`, `POST /read-all`, `PATCH /:id/read`
- `/admin`: `GET /stats`, `GET /users`, `PATCH /users/:id/role`, `GET /events`, `POST /events/:id/takedown`

Socket.IO emits a `notification` event to the user, and the web app refetches notifications when it arrives.

## Layout

```
knot-mern/
  server/   Express API, Mongoose models, Socket.IO, jobs, seed, tests
  client/   React + Vite web app
```

Server source:

- `src/config/`: environment validation (Zod), logger, database connection
- `src/models/`: User, Locality, Event, Registration, Notification, Announcement
- `src/services/`: business rules (events, registrations, organizer, notifications, users, admin)
- `src/routes/`: HTTP routes, one file per area
- `src/utils/`: geo, ICS, CSV, scheduling, tokens, serialization
- `src/jobs/`: reminders and housekeeping

Client source:

- `src/pages/`: discover, event detail, plan, profile, notifications, organizer, admin, auth
- `src/components/`: event cards, map, filters, pass card, forms, layout
- `src/context/AuthContext.jsx`: session state and socket reconnects
- `src/lib/`: API client, socket client, formatting (IST), constants

## Known limits

- Geo search uses a bounding box followed by an exact distance check on plain numeric fields. This works on any MongoDB and avoids a hard dependency on 2dsphere indexes.
- Map tiles come from OpenStreetMap by default. Offline or restricted networks show blank tiles, and the rest of the app still works.
- Knot does not take payments. Paid events show the stated price, and payment happens off-platform.
- Notifications are in-app only. Email or SMS delivery is out of scope.
