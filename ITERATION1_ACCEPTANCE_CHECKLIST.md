# CampusRent Iteration 1 Acceptance Checklist

Use the shared test bed and record Pass/Fail evidence for every item. The scope is US-03, US-22, and US-04 through US-13 only.

## Release-wide access constraint

- [ ] Guest cannot access `/browse`, item details, listing management, or rental routes.
- [ ] Pending student can sign in and view account status but cannot access protected student routes.
- [ ] Rejected student cannot use protected student routes.
- [ ] Verified student can use registered-student functions.
- [ ] Administrator can access the verification dashboard.
- [ ] Administrator cannot browse, create, edit, delete, or rent student items.
- [ ] Non-administrator cannot access the verification dashboard.

## US-03 — Register using institutional email (8 SP)

- [ ] Valid institutional email registration succeeds.
- [ ] Personal email registration is rejected.
- [ ] Incomplete form displays a validation error.
- [ ] Duplicate registration is rejected.
- [ ] New account is stored as a student with Pending Verification status.

## US-22 — Verify student accounts (8 SP)

- [ ] Administrator sees pending student registrations.
- [ ] Approve changes a pending account to Verified.
- [ ] Reject changes a pending account to Rejected.
- [ ] Already processed account cannot be processed again.
- [ ] Student cannot access administrator verification controls.

## US-04 — Create item listings (5 SP)

- [ ] Verified student creates a valid listing.
- [ ] Missing title is rejected.
- [ ] Missing or invalid category is rejected.
- [ ] Missing availability is rejected by the API.
- [ ] Authenticated student is automatically stored as owner.
- [ ] Listing appears in the catalogue.
- [ ] Maximum five JPG, PNG, or WEBP images are accepted.
- [ ] Six images are rejected.
- [ ] An image larger than 5 MB is rejected.
- [ ] Administrator cannot create a listing.

## US-05 — Edit item listings (5 SP)

- [ ] Owner edits title and sees the updated title.
- [ ] Owner edits category and sees the updated category.
- [ ] Valid changes remain after refresh.
- [ ] Another student cannot edit the listing.
- [ ] Administrator cannot edit the listing.
- [ ] Existing image can be removed.
- [ ] New image can be added without exceeding five total images.

## US-06 — Remove item listings (3 SP)

- [ ] Owner receives a confirmation prompt.
- [ ] Cancelling confirmation keeps the listing.
- [ ] Confirming removes the listing.
- [ ] Removed listing no longer appears in catalogue results.
- [ ] Another student cannot remove the listing.
- [ ] Administrator cannot remove the listing.

## US-07 — Update item availability (3 SP)

- [ ] Owner marks item Unavailable.
- [ ] Owner marks item Available.
- [ ] New status remains after refresh.
- [ ] Updated status appears on the item page and listing card.
- [ ] Another student cannot update availability.
- [ ] Administrator cannot update availability.

## US-08 — Browse available listings (3 SP)

- [ ] Verified student opens the catalogue.
- [ ] Listing cards show title, category, image/placeholder, and availability.
- [ ] Available listings display by default.
- [ ] Unavailable listings can be identified by selecting the Unavailable filter.
- [ ] Previous/Next controls display additional pages when more than six results exist.
- [ ] Selecting a card opens its item-details page.

## US-09 — Search listings using keywords and filters (5 SP)

- [ ] Keyword search matches title or description.
- [ ] Category filter returns matching items.
- [ ] Availability filter returns matching items.
- [ ] Keyword, category, and availability work together.
- [ ] No-results message appears when nothing matches.
- [ ] Invalid category or availability query value is rejected safely.

## US-10 — View item details (3 SP)

- [ ] Page shows title, description, category, availability, terms, and images.
- [ ] Verified student sees owner name and permitted contact information.
- [ ] Unavailable status is clearly shown.
- [ ] Missing listing returns a not-found response and safe redirect.
- [ ] Guest, pending student, and administrator cannot access protected item details.

## US-11 — Submit rental requests (5 SP)

- [ ] Verified student submits a request for an available item.
- [ ] Start and end dates are required.
- [ ] Past start date is rejected.
- [ ] End date on or before start date is rejected.
- [ ] Request for unavailable item is rejected.
- [ ] Student cannot request own listing.
- [ ] Duplicate pending request is rejected.
- [ ] New request begins with Pending status.
- [ ] Administrator cannot submit a rental request.

## US-12 — View incoming rental requests (3 SP)

- [ ] Owner opens incoming-request dashboard.
- [ ] Only requests for that owner's listings are returned.
- [ ] Renter name/email, rental dates, listing, and status are displayed.
- [ ] Another student cannot view the owner's incoming requests.
- [ ] Administrator cannot access incoming student requests.

## US-13 — Approve rental requests (3 SP)

- [ ] Listing owner approves a Pending request.
- [ ] Status changes to Accepted.
- [ ] Approved item changes to Unavailable.
- [ ] Renter refreshes the item page and sees Accepted status.
- [ ] Another student cannot approve the request.
- [ ] Administrator cannot approve the request.
- [ ] Already accepted request cannot be approved again.
