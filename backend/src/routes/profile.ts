import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { User, toPublicUser } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * US-21.3 / US-21.4 — get-profile / update-profile for the verified student.
 *
 * GET  /api/profile
 * PATCH /api/profile
 *
 * Always targets req.user.id — no user id in path/body/query.
 * Editable fields only: first_name, last_name, phone.
 *
 * US-21.4 protected-field policy: if a protected/security User field is
 * supplied in the PATCH body, reject with 400 (do not silently ignore).
 *
 * Auth: authenticate + requireVerifiedStudent.
 * File name avoids backend/src/routes/users.ts (Iteration 1 verify forbid).
 */
router.use(authenticate, requireVerifiedStudent);

/** Identity / security fields — presence in PATCH body is a validation error. */
export const PROTECTED_PROFILE_BODY_FIELDS = [
  'email',
  'verification_status',
  'role',
  'status',
  'id',
  '_id',
  'user_id',
  'created_at',
  'password',
  'password_hash',
] as const;

export type ProtectedProfileBodyField = (typeof PROTECTED_PROFILE_BODY_FIELDS)[number];

export function findProtectedProfileFieldsInBody(
  body: Record<string, unknown>
): ProtectedProfileBodyField[] {
  return PROTECTED_PROFILE_BODY_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(body, field)
  );
}

function normalizeRequiredName(raw: unknown, fieldLabel: string): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: `${fieldLabel} is required` };
  }
  if (typeof raw !== 'string') {
    return { error: `${fieldLabel} must be a string` };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { error: `${fieldLabel} is required` };
  }
  return trimmed;
}

/** Optional phone — string, trimmed; blank becomes '' (registration convention). */
function normalizeOptionalPhone(raw: unknown): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: 'phone must be a string' };
  }
  if (typeof raw !== 'string') {
    return { error: 'phone must be a string' };
  }
  return raw.trim();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(toPublicUser(user));
  })
);

/**
 * Full editable-form PATCH (matches frontend UpdateProfileBody).
 * Requires first_name, last_name, and phone.
 * Protected User fields in the body → 400 (US-21.4).
 */
router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Invalid profile update body' });
    }

    const record = body as Record<string, unknown>;
    const protectedFields = findProtectedProfileFieldsInBody(record);
    if (protectedFields.length > 0) {
      return res.status(400).json({
        error: `Cannot update protected field(s): ${protectedFields.join(', ')}`,
      });
    }

    const firstName = normalizeRequiredName(record.first_name, 'First name');
    if (typeof firstName === 'object') {
      return res.status(400).json({ error: firstName.error });
    }

    const lastName = normalizeRequiredName(record.last_name, 'Last name');
    if (typeof lastName === 'object') {
      return res.status(400).json({ error: lastName.error });
    }

    const phone = normalizeOptionalPhone(record.phone);
    if (typeof phone === 'object') {
      return res.status(400).json({ error: phone.error });
    }

    // Ownership: always the authenticated student — never a client-selected id.
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.first_name = firstName;
    user.last_name = lastName;
    user.phone = phone;
    await user.save();

    return res.json(toPublicUser(user));
  })
);

export default router;
