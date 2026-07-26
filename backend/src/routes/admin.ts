import { Router } from 'express';
import db from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/verifications', (_req, res) => {
  const users = db.prepare(
    `SELECT id, email, first_name, last_name, verification_status, created_at
     FROM users WHERE role = 'student' AND verification_status = 'pending'
     ORDER BY created_at ASC`
  ).all();
  res.json(users);
});

router.patch('/verifications/:id', (req, res) => {
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be approve or reject' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as
    | { id: number; role: string; verification_status: string }
    | undefined;

  if (!user || user.role !== 'student') {
    return res.status(404).json({ error: 'Student not found' });
  }
  if (user.verification_status !== 'pending') {
    return res.status(400).json({ error: 'This student account has already been processed' });
  }

  const status = action === 'approve' ? 'verified' : 'rejected';
  db.prepare('UPDATE users SET verification_status = ? WHERE id = ?').run(status, user.id);

  const updated = db.prepare(
    `SELECT id, email, first_name, last_name, verification_status, created_at
     FROM users WHERE id = ?`
  ).get(user.id);

  return res.json(updated);
});

export default router;
