# Shruti's Beauty Parlour — Website, Booking System & Admin Dashboard

A complete, production-ready salon application: public website, real appointment
booking engine, customer self-service, and a secure owner dashboard.

Built with **Node.js + Express**, **SQLite** (via Node's built-in `node:sqlite`,
so there are no native modules to compile), and server-rendered **EJS** pages.

---

## Quick start

Requirements: **Node.js 22.5 or newer** (Node 24 recommended).

```bash
cd shrutis-beauty-parlour
npm install
cp .env.example .env      # already done for you
npm start
```

- Website: <http://localhost:3001>
- Admin: <http://localhost:3001/admin>

Default admin login (printed to the console on first run):

```
email:    admin@shrutisbeautyparlour.local
password: ChangeMe@123
```

Change it from **Admin → Business settings → Change password**, or run
`npm run reset-admin`.

---

## What is real (not a mockup)

| Area | Implementation |
|---|---|
| Database | SQLite file at `data/salon.db`, schema auto-created on first run |
| Availability | Computed server-side from opening hours, service duration and existing bookings |
| Double-booking prevention | Partial unique index on `(date, time)` for live appointments + transaction + overlap check |
| Booking | Real POST endpoint, server-side validation, instant confirmation page |
| Self-service | Cancel and reschedule from the booking link; cancelled slots are released instantly |
| Admin dashboard | Today's / upcoming / completed / cancelled counts, total bookings, revenue estimate |
| Appointments | Confirm, cancel, reschedule, mark completed, click-to-call |
| Services | Full CRUD incl. price, duration, category, description, image upload |
| Gallery | Upload / edit / delete, category filters, lightbox on the site |
| Reviews | CRUD with star rating and a "sample review" flag |
| FAQs | CRUD |
| Settings | Business details, hours, slot interval, booking horizon, cancellation notice, reminders, payment note |
| Email | Nodemailer with professional templates (SMTP via `.env`) |
| SMS | Provider-agnostic webhook (`SMS_WEBHOOK_URL`) |
| WhatsApp | Floating button with pre-filled message + post-booking contact link |
| Reminders | 24-hour and optional 2-hour, scheduled every 10 minutes in the salon's timezone |
| Security | bcrypt passwords, signed httpOnly sessions, CSRF tokens, rate limiting, input sanitisation, Helmet CSP |

**When SMTP/SMS credentials are missing**, messages are not lost — they are
stored in the notification log (`Admin → Business settings`) so you can see
exactly what would have been sent.

---

## Project structure

```
shrutis-beauty-parlour/
├── server.js               Express app, middleware, security headers
├── src/
│   ├── db.js               SQLite connection + schema + helpers
│   ├── defaults.js         Placeholder content (services, FAQs, gallery, settings)
│   ├── seed.js             Idempotent seeding
│   ├── utils.js            Settings cache, money/date/time, timezone + slot maths
│   ├── booking.js          Booking engine (create/cancel/reschedule/validate)
│   ├── notify.js           Email + SMS templates and delivery
│   ├── reminders.js        Reminder scheduler
│   ├── session.js          Signed-cookie sessions with CSRF token
│   ├── reset-admin.js      CLI password reset
│   └── routes/
│       ├── site.js         Public pages, availability API, sitemap, robots
│       ├── booking.js      Booking API, confirmation, calendar, cancel/reschedule
│       └── admin.js        Authentication, dashboard, all CRUD endpoints
├── views/                  EJS templates (public + admin)
├── public/                 CSS, JS, favicon, uploaded images
├── test/smoke.js           43 automated end-to-end checks
└── data/salon.db           SQLite database (git-ignored)
```

---

## How booking availability works

1. Slots are generated from `open_time` → `close_time` in `slot_interval`
   steps (default 30 minutes).
2. A slot is offered only if `slot + service duration ≤ closing time`.
3. Slots in the past are never offered (evaluated in the salon timezone).
4. A slot overlapping an existing `confirmed`/`pending` appointment is hidden,
   so a 60-minute facial starting at 12:00 also blocks an 11:30 slot that
   would run past 12:00.
5. Sundays are blocked; the horizon (default 60 days) is enforced.
6. On submit the server re-checks everything inside a transaction, and a
   partial unique index guarantees two customers can never hold the same slot.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 3001) |
| `SESSION_SECRET` | Signs the admin session cookie — **change in production** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run admin credentials |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Email delivery |
| `MAIL_FROM`, `SALON_OWNER_EMAIL`, `SALON_OWNER_PHONE` | Sender and owner recipients |
| `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_KEY` | Any SMS provider accepting `{to, message}` |
| `WHATSAPP_NUMBER` | Fallback WhatsApp number in international format |

Opening hours, prices, durations, photos and all business details are **not**
in `.env` — they live in the database and are edited from the admin dashboard.

---

## Content that is placeholder, and what to replace

The site is complete and functional, but the following are **samples** and are
labelled as such on the site until you edit them:

- Phone number, email and address show `[Add actual number later]` style
  placeholders rather than invented contact details.
- Prices and durations are realistic sample INR values (₹50–₹7,000).
- Reviews are marked **"Sample review"** and are flagged `is_sample = 1`.
- Photos are royalty-free placeholder images from Unsplash; replace them with
  your own work via **Admin → Gallery** / **Admin → Services**.
- No certifications, awards or claims about experience are invented.

Open hours **11:00 AM – 6:30 PM** and the Sunday closure are sensible defaults
and are editable in **Business settings**.

---

## SEO

- Unique title and meta description per page
- Open Graph + Twitter card metadata
- `BeautySalon` JSON-LD structured data (no invented address/location)
- Generated `sitemap.xml` and `robots.txt` (admin area disallowed)
- Semantic landmarks, skip link, alt text, `aria-expanded`/`aria-hidden`
  states, visible focus styles, `prefers-reduced-motion` support

## Testing

With the server running:

```bash
npm test
```

Covers all public pages, availability rules, booking creation, double-booking
prevention, validation, calendar download, reschedule, cancel + slot release,
admin authentication, CSRF protection, admin pages and service CRUD.

## Production notes

1. Set a strong `SESSION_SECRET` and `NODE_ENV=production`.
2. Change the admin password.
3. Add SMTP credentials for real email confirmations.
4. Back up `data/salon.db` (it is a single file).
5. Serve behind HTTPS so the session cookie is marked `Secure`.