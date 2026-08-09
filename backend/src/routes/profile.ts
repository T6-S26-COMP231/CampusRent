import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { User, toPublicUser } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * US-21.3 — get-profile / update-profile for the verified student.
 *
 * GET  /api/profile
 * PATCH /api/profile
 *
 * Always targets req.user.id — no user id in path/body.
 * Editable fields only: first_name, last_name, phone.
 * Protected fields (email, verification_status, role, status, id, …) are
 * never written here. Stronger malicious-body rejection: US-21.4.
 *
 * Auth: authenticate + requireVerifiedStudent (release-wide approved-account
 * constraint for US-04–US-24 protected features).
 * File name avoids backend/src/routes/users.ts (Iteration 1 verify forbid).
 */
router.use(authenticate, requireVerifiedStudent);

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
 * Requires first_name, last_name, and phone on every request.
 * Protected body keys are ignored — not applied.
 */
router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      first_name?: unknown;
      last_name?: unknown;
      phone?: unknown;
      email?: unknown;
      verification_status?: unknown;
      role?: unknown;
      status?: unknown;
      id?: unknown;
      password?: unknown;
      password_hash?: unknown;
    };

    // Client identity / protected fields are ignored — only req.user.id is updated.
    void body.email;
    void body.verification_status;
    void body.role;
    void body.status;
    void body.id;
    void body.password;
    void body.password_hash;

    const firstName = normalizeRequiredName(body.first_name, 'First name');
    if (typeof firstName === 'object') {
      return res.status(400).json({ error: firstName.error });
    }

    const lastName = normalizeRequiredName(body.last_name, 'Last name');
    if (typeof lastName === 'object') {
      return res.status(400).json({ error: lastName.error });
    }

    const phone = normalizeOptionalPhone(body.phone);
    if (typeof phone === 'object') {
      return res.status(400).json({ error: phone.error });
    }

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
