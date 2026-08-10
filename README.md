# CampusRent — Release 1.0

CampusRent is a student-to-student item rental platform developed for COMP231 by Team 6.

Release 1.0 includes the completed functionality from Iteration 1 and Iteration 2, covering guest access, registered student rental workflows, messaging, reporting, reviews, profile management, student verification, moderation, and administrator activity monitoring.

---

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- React Router

### Backend
- Node.js
- Express
- TypeScript
- MongoDB
- Mongoose
- JWT authentication

### Deployment
- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas

---

## User Roles

| Role | Access |
|---|---|
| Guest | Browse limited listing previews, search/filter listings, view basic item details, register, and sign in |
| Pending Student | View account verification status while waiting for administrator approval |
| Verified Registered Student | Browse listings, manage own listings, submit/manage rental requests, message other students, report content, submit reviews, and manage profile |
| System Administrator | Verify student accounts, review reports, moderate users/listings, and monitor platform activity |

Administrators and registered students have separate permissions. Administrator access does not automatically provide registered-student rental permissions.

---

## Release 1.0 Features

### Guest Features

- **US-01 — Browse and search limited listing previews**
  - Browse public listing previews
  - Keyword search
  - Category filtering
  - Owner/contact information remains hidden
  - Restricted actions prompt registration/sign-in

- **US-02 — View basic item information**
  - View title
  - View category
  - View description
  - View availability
  - Owner/contact information remains hidden
  - Rental actions require registration

---

### Registration and Verification

- **US-03 — Register using an institutional email**
  - Required-field validation
  - Institutional email validation
  - Duplicate-account protection
  - New accounts begin as Pending Verification

- **US-22 — Verify student accounts**
  - Administrator reviews pending registrations
  - Approve student account
  - Reject student account
  - Request More Information while keeping the account Pending

---

### Listing Management

- **US-04 — Create item listings**
  - Title
  - Category
  - Description
  - Availability
  - Rental terms
  - Automatic owner assignment
  - Multiple listing images

- **US-05 — Edit item listings**
  - Owners can edit their own listings
  - Existing images can be preserved
  - New images can be added

- **US-06 — Remove item listings**
  - Owner-only deletion
  - Confirmation before removal

- **US-07 — Update availability**
  - Mark listings Available or Unavailable

- **US-08 — Browse available listings**
  - Registered-student catalogue
  - Pagination
  - Availability information

- **US-09 — Search using keywords and filters**
  - Keyword search
  - Category filter
  - Availability filter
  - Clear no-results state

- **US-10 — View registered-student item details**
  - Full listing information
  - Availability
  - Rental terms
  - Owner information for authorized users
  - Listing image gallery

---

## Listing Image Rules

Each listing supports a maximum of **5 images**.

Supported formats:

- JPG / JPEG
- PNG
- WEBP

Each image must be no larger than **5 MB**.

Both frontend and backend validation enforce the image limit.

---

## Rental Requests

- **US-11 — Submit rental request**
  - Select rental dates
  - Submit requests for available listings
  - New requests begin as Pending

- **US-12 — View incoming rental requests**
  - Listing owners can review requests
  - View renter information
  - View rental dates
  - View request status

- **US-13 — Approve rental requests**
  - Listing owners can accept valid requests
  - Request status becomes Accepted

- **US-14 — Decline rental requests**
  - Listing owners can decline requests
  - Request status becomes Declined

- **US-15 — Track rental request status**
  - Pending
  - Accepted
  - Declined
  - Cancelled
  - Completed

---

## Messaging

- **US-16 — Start conversations**
  - Registered students can start conversations with other students
  - Starting a conversation requires an initial nonblank message
  - Empty conversations are not created
  - Conversation list shows the most recent message preview

- **US-17 — Send messages**
  - Participants can send additional messages
  - Blank messages are rejected
  - Non-participants cannot access the conversation

- **US-18 — View conversation history**
  - Messages are displayed chronologically
  - Previous messages remain available
  - Access is limited to conversation participants

---

## Reviews, Reports, and Profile

- **US-19 — Ratings and reviews**
  - Reviews are available after a completed rental
  - Validation prevents incomplete reviews
  - Reviews can be displayed with listings

- **US-20 — Report inappropriate users or listings**
  - Submit reports with a reason/details
  - Reports are stored for administrator review
  - Incomplete reports are rejected

- **US-21 — Manage profile**
  - View profile
  - Update permitted profile fields
  - Validation for invalid information
  - Verification status is visible but cannot be changed by the user

---

## Administration

- **US-23 — Moderation**
  - Review submitted reports
  - Review reported listings/users
  - Warn
  - Remove listing
  - Suspend user
  - Resolve/dismiss moderation cases
  - Moderation actions are recorded

- **US-24 — Activity monitoring and reporting**
  - Administrator activity dashboard
  - Activity filtering
  - Summary/report generation
  - Clear no-data state

---

## Access Control

CampusRent enforces role-based authorization on both the frontend and backend.

### Guests
Guests can access only public guest endpoints.

### Pending Students
Pending students cannot use protected registered-student rental functionality.

### Verified Students
Protected student functionality requires:

- Authentication
- Verified student status

### Administrators
Administrator functionality requires:

- Authentication
- Administrator role

Protected authorization is enforced by backend middleware and supported by frontend route handling.

---

## Project Structure

```text
CampusRent/
├── backend/
│   ├── src/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── index.ts
│   └── tests/
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── utils/
│   │   └── api/
│   └── public/
│
└── scripts/
