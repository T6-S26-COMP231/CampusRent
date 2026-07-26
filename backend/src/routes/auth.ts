import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db';
import { signToken, authenticate } from '../middleware/auth';
import { isInstitutionalEmail } from '../utils/validation';

const router = Router();

router.post('/register', (req, res) => {
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
      error: 'Only institutional email addresses are accepted (e.g. @mycentennialcollege.ca, .edu)',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?)`
    )
    .run(normalizedEmail, password_hash, first_name.trim(), last_name.trim());

  const user = db
    .prepare(
      `SELECT id, email, first_name, last_name, role, verification_status, status, created_at
       FROM users WHERE id = ?`
    )
    .get(result.lastInsertRowid);

  res.status(201).json({
    message: 'Registration successful. Your account is pending verification.',
    user,
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase()) as
    | {
        id: number;
        email: string;
        password_hash: string;
        first_name: string;
        last_name: string;
        role: string;
        verification_status: string;
        status: string;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Account suspended' });
  }
  if (user.verification_status === 'rejected') {
    return res.status(403).json({ error: 'Registration was denied. Contact administration.' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      verification_status: user.verification_status,
      status: user.status,
    },
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = db
    .prepare(
      `SELECT id, email, first_name, last_name, phone, role,
              verification_status, status, created_at
       FROM users WHERE id = ?`
    )
    .get(req.user!.id);
  res.json(user);
});

export default router;
