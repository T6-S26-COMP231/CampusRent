import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(name, condition, details = '') {
  checks.push({ name, pass: Boolean(condition), details });
}

const app = read('frontend/src/App.tsx');
const authContext = read('frontend/src/context/AuthContext.tsx');
const authMiddleware = read('backend/src/middleware/auth.ts');
const listingRoutes = read('backend/src/routes/listings.ts');
const requestRoutes = read('backend/src/routes/requests.ts');
const adminRoutes = read('backend/src/routes/admin.ts');

check('Student verification excludes administrators',
  authContext.includes("user?.role === 'student' && user.verification_status === 'verified'") &&
  !authContext.includes("verification_status === 'verified' || user?.role === 'admin'"));
check('Backend registered-student middleware requires student role',
  authMiddleware.includes("req.user.role !== 'student'"));
check('Listing API is protected as verified-student-only',
  listingRoutes.includes('router.use(authenticate, requireVerifiedStudent)'));
check('Rental API is protected as verified-student-only',
  requestRoutes.includes('router.use(authenticate, requireVerifiedStudent)'));
check('Administrator API is protected as admin-only',
  adminRoutes.includes('router.use(authenticate, requireAdmin)'));
check('Frontend student routes use verified-student guard',
  (app.match(/requireVerifiedStudent/g) || []).length >= 6);
check('Frontend administrator route uses admin guard',
  app.includes('<ProtectedRoute requireAdmin>'));
check('Five-image maximum is enforced by backend',
  listingRoutes.includes('const MAX_IMAGES = 5') && listingRoutes.includes('maximum of 5 images'));
// Route handlers use multiline Express registration after the MongoDB migration.
// US-14 decline remains intentionally out of Iteration 1 scope.
check('US-13 renter can see Accepted result without full US-15 dashboard',
  requestRoutes.includes('/mine/listing/:listingId') &&
  !requestRoutes.includes('/:id/decline'));

const requiredFiles = [
  'frontend/src/pages/RegisterPage.tsx',
  'frontend/src/pages/AdminPage.tsx',
  'frontend/src/pages/CreateListingPage.tsx',
  'frontend/src/pages/EditListingPage.tsx',
  'frontend/src/pages/BrowsePage.tsx',
  'frontend/src/pages/ListingDetailPage.tsx',
  'frontend/src/pages/RequestsPage.tsx',
  'backend/src/routes/auth.ts',
  'backend/src/routes/admin.ts',
  'backend/src/routes/listings.ts',
  'backend/src/routes/requests.ts',
];
check('All Iteration 1 implementation files are present', requiredFiles.every(exists));

const forbiddenFiles = [
  'frontend/src/pages/MessagesPage.tsx',
  'frontend/src/pages/ProfilePage.tsx',
  'backend/src/routes/messages.ts',
  'backend/src/routes/reviews.ts',
  'backend/src/routes/reports.ts',
  'backend/src/routes/users.ts',
];
check('Iteration 2 pages and routes are absent', forbiddenFiles.every((file) => !exists(file)));

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.details ? ` — ${item.details}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} Iteration 1 alignment check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} Iteration 1 alignment checks passed.`);
