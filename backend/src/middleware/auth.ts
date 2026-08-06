import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env';
import { User, toAuthUser } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

export interface AuthUser {
  id: number;
  email: string;
  role: 'student' | 'admin';
  verification_status: 'pending' | 'verified' | 'rejected';
  status: 'active' | 'suspended';
  first_name: string;
  last_name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: number; email: string; role: string }) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, getJwtSecret(), {
    expiresIn: '7d',
  });
}

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload: { id: number };
  try {
    payload = jwt.verify(header.slice(7), getJwtSecret()) as { id: number };
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Database failures must propagate to error middleware (not look like auth failures).
  const user = await User.findById(payload.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Account suspended' });
  }

  req.user = toAuthUser(user);
  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  let payload: { id: number };
  try {
    payload = jwt.verify(header.slice(7), getJwtSecret()) as { id: number };
  } catch {
    return next();
  }

  try {
    const user = await User.findById(payload.id);
    if (user && user.status !== 'suspended') {
      req.user = toAuthUser(user);
    }
  } catch {
    /* Optional auth must not block the request on database issues. */
  }
  next();
});

/**
 * Iteration 1 registered-student functions belong only to verified users whose
 * role is "student". Administrators are a separate System Administration Team
 * role and must not create listings, browse the student catalogue, submit
 * requests, or manage student-owned listings.
 */
export function requireVerifiedStudent(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Registered student access required' });
  }

  if (req.user.verification_status !== 'verified') {
    return res.status(403).json({
      error: 'Account verification required',
      verification_status: req.user.verification_status,
    });
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'System Administration Team access required' });
  }
  next();
}
