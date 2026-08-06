import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken, authenticate } from '../middleware/auth';
import { nextId } from '../models/Counter';
import { User, toPublicUser } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import { isInstitutionalEmail } from '../utils/validation';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, first_name, last_name } = req.body as {
      email?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
    };

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof first_name !== 'string' ||
      typeof last_name !== 'string' ||
      !email.trim() ||
      !password ||
      !first_name.trim() ||
      !last_name.trim()
    ) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!isInstitutionalEmail(email.trim())) {
      return res.status(400).json({
        error:
          'Only institutional email addresses are accepted (e.g. @mycentennialcollege.ca, .edu)',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = await nextId('users');
    const user = await User.create({
      _id: id,
      email: normalizedEmail,
      password_hash: bcrypt.hashSync(password, 10),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      phone: '',
      role: 'student',
      verification_status: 'pending',
      status: 'active',
    });

    return res.status(201).json({
      message: 'Registration successful. Your account is pending verification.',
      user: toPublicUser(user),
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }
    if (user.verification_status === 'rejected') {
      return res.status(403).json({ error: 'Registration was denied. Contact administration.' });
    }

    const token = signToken({ id: user._id, email: user.email, role: user.role });
    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        verification_status: user.verification_status,
        status: user.status,
      },
    });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    return res.json(toPublicUser(user));
  })
);

export default router;
