# CampusRent — Iteration 1 Test Bed

CampusRent is a student-to-student item-rental platform for COMP231 Team 1. This package is intentionally limited to the **twelve Must-Have user stories planned for Iteration 1 (54 story points)**.

## Role and access rules

| Role/account state | Allowed in Iteration 1 | Not allowed |
|---|---|---|
| Guest | Register and sign in | Browse the student catalogue, view protected item details, create listings, or use rental functions |
| Pending or rejected student | View the read-only account verification status | All protected registered-student functions |
| Verified Registered Student User | Browse/search listings, view full details, create/manage own listings, submit requests, view incoming requests for owned listings, and approve owned-listing requests | Edit/delete another student's listing or approve another owner's request |
| System Administration Team | View pending registrations and approve or reject them | **Browse, create, edit, delete, or rent student items** |

The student and administrator roles are deliberately separate. An administrator is **not** treated as a verified student by either the React route guards or the Express API middleware.

## Iteration 1 scope

| ID | User story | Included behaviour |
|---|---|---|
| US-03 | Register using an institutional email | Required-field validation, institutional-email validation, duplicate protection, Pending Verification status |
| US-22 | Verify student accounts | Admin-only pending queue with Approve and Reject actions |
| US-04 | Create item listings | Verified-student-only creation, required fields, automatic owner assignment, maximum five images |
| US-05 | Edit item listings | Owner-only editing and image removal/addition while keeping five-image maximum |
| US-06 | Remove item listings | Owner-only removal with confirmation |
| US-07 | Update item availability | Owner-only Available/Unavailable changes that persist |
| US-08 | Browse available listings | Verified-student catalogue, listing cards, availability display, and pagination |
| US-09 | Search using keywords and filters | Keyword, category, and availability filters plus clear no-results state |
| US-10 | View item details | Full details, terms, images, availability, and owner contact information for verified students |
| US-11 | Submit rental requests | Required future dates, available-item validation, own-item and duplicate protection, Pending status |
| US-12 | View incoming rental requests | Owner-only incoming dashboard with renter, dates, and status |
| US-13 | Approve rental requests | Owner-only approval, Accepted status, item becomes Unavailable, renter can see the Accepted result on the item page |

## Intentionally excluded from this package

These Release 1.0 stories belong outside Iteration 1 and are not implemented here:

- US-01 and US-02 guest catalogue/details
- US-14 decline rental requests
- US-15 full request tracking, cancellation, and completed-rental workflow
- US-16 to US-18 conversations and messaging
- US-19 ratings and reviews
- US-20 reporting users or listings
- US-21 profile management
- US-23 moderation
- US-24 platform monitoring and reports

The small renter-visible request-status panel is present only because US-13 requires an Accepted status to be visible to the renter. It is not a full US-15 dashboard.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Authentication | JWT |
| Persistence | MongoDB (Mongoose) via `MONGODB_URI` |
| API | REST over HTTP/JSON |

> Application data (users, listings, rental requests) is stored in MongoDB. Configure `MONGODB_URI` before starting the backend. The API refuses to start without a valid MongoDB connection and does not fall back to local JSON storage.
>
> **Image files** are still written to `backend/uploads/` on the local filesystem. MongoDB persists listing records and image *filenames*, but uploaded binary files are not durable on ephemeral hosts (for example Render’s default disk). For production image durability, mount a Render persistent disk at `backend/uploads` or move uploads to object storage (S3, Cloudinary, etc.).

## Install and run

Requirements: Node.js 18 or newer and npm.

```bash
npm install
npm run install:all
npm run verify:iteration1
npm run build
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend health check: `http://localhost:3001/api/health`

The root `dev` command seeds demonstration data and starts both applications.

## Demonstration accounts

| Role | Email | Password |
|---|---|---|
| System Administration Team | `admin@mycentennialcollege.ca` | `admin123` |
| Verified student | `maria@mycentennialcollege.ca` | `student123` |
| Verified student | `john@mycentennialcollege.ca` | `student123` |

New registrations begin in **Pending Verification** status.

## Required role-separation demonstration

1. Sign in as the administrator.
2. Confirm the navigation contains only **Verify Students** and **Account**.
3. Manually enter `/listings/new`; the app redirects to `/admin`.
4. Sign in as a verified student and confirm **List Item** is available.
5. This behaviour is also enforced by the API, so an administrator token receives HTTP 403 from listing and rental routes.

## Environment variables

Backend:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER_HOST/DATABASE_NAME
```

Frontend, only when the API is deployed separately:

```env
VITE_API_URL=https://your-backend.example.com/api
```

Never commit `.env` files, JWT secrets, passwords, database credentials, or API keys.

### Legacy JSON migration (optional, one-time)

If you still have a local `backend/data/store.json` from the old test-bed store, import missing rows into MongoDB with:

```bash
npm run migrate:store --prefix backend
```

This script inserts only missing users, listings, and rental requests. It does **not** run on normal startup, does not overwrite existing MongoDB documents, and does not delete the JSON file.

## Project structure

```text
CampusRent/
├── backend/src/
│   ├── config/env.ts
│   ├── db/connection.ts
│   ├── models/
│   ├── middleware/auth.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── admin.ts
│   │   ├── listings.ts
│   │   └── requests.ts
│   ├── utils/
│   ├── app.ts
│   ├── index.ts
│   └── seed.ts
├── backend/scripts/migrate-store-json.ts
├── frontend/src/
│   ├── api/
│   ├── components/
│   ├── context/
│   ├── pages/
│   ├── utils/
│   └── App.tsx
├── scripts/verify-iteration1.mjs
├── ITERATION1_ACCEPTANCE_CHECKLIST.md
├── TAC_ALIGNMENT_MATRIX.md
└── README.md
```

## Acceptance-testing order

US-03 → US-22 → US-04 → US-05 → US-06 → US-07 → US-08 → US-09 → US-10 → US-11 → US-12 → US-13.

A story should be reported as complete only after every acceptance test passes in the shared test bed.
