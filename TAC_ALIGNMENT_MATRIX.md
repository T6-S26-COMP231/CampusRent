# TAC Alignment Matrix — CampusRent Iteration 1

| Story | TAC role and result | Frontend evidence | Backend evidence |
|---|---|---|---|
| US-03 | Guest registers with institutional email; account becomes Pending | `RegisterPage.tsx`, `AccountPage.tsx` | `routes/auth.ts`, institutional validation |
| US-22 | System Administration Team verifies student accounts | `AdminPage.tsx` | `routes/admin.ts` protected by `requireAdmin` |
| US-04 | Registered Student User creates owned listing | `CreateListingPage.tsx` | `POST /api/listings`, verified-student middleware, owner from token |
| US-05 | Owner edits own listing | `EditListingPage.tsx` | `PUT /api/listings/:id`, owner check |
| US-06 | Owner removes own listing with confirmation | `EditListingPage.tsx` | `DELETE /api/listings/:id`, owner check |
| US-07 | Owner updates Available/Unavailable | `EditListingPage.tsx` | `PATCH /api/listings/:id/availability`, owner check |
| US-08 | Verified student browses catalogue and pages | `BrowsePage.tsx`, `ListingCard.tsx` | `GET /api/listings` with availability and pagination |
| US-09 | Keyword/category/availability filtering | `BrowsePage.tsx` | validated listing query filters |
| US-10 | Verified student views full details and owner contact | `ListingDetailPage.tsx` | `GET /api/listings/:id` behind verified-student middleware |
| US-11 | Verified student submits Pending request for available item | `ListingDetailPage.tsx` | `POST /api/requests` validation |
| US-12 | Owner views incoming requests | `RequestsPage.tsx` | `GET /api/requests/incoming`, owner-scoped query |
| US-13 | Owner approves; Accepted visible to renter; item Unavailable | `RequestsPage.tsx`, `ListingDetailPage.tsx` | approval endpoint plus renter-visible status endpoint |

## Access-control implementation

- `frontend/src/context/AuthContext.tsx`: a user is verified only when role is `student` and status is `verified`.
- `frontend/src/App.tsx`: student routes use `requireVerifiedStudent`; administrator route uses `requireAdmin`.
- `backend/src/middleware/auth.ts`: administrators do not pass `requireVerifiedStudent`.
- `backend/src/routes/listings.ts` and `backend/src/routes/requests.ts`: all routes require a verified student.
- `backend/src/routes/admin.ts`: all routes require the System Administration Team role.

## Excluded Iteration 2 scope

No message, review, report, profile-editing, decline, cancellation, completed-rental, moderation, or platform-reporting route/page is included.
