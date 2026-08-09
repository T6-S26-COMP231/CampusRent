import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getAdminModerationReport,
  listAdminModerationReports,
} from '../utils/moderationReports';

const router = Router();
router.use(authenticate, requireAdmin);

router.get(
  '/verifications',
  asyncHandler(async (_req, res) => {
    const users = await User.find({
      role: 'student',
      verification_status: 'pending',
    })
      .sort({ created_at: 1 })
      .lean();

    return res.json(
      users.map((user) => ({
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        verification_status: user.verification_status,
        created_at: user.created_at.toISOString(),
      }))
    );
  })
);

/**
 * US-23.3 — admin moderation report list.
 * Returns the same Report documents created by POST /api/reports,
 * with resolved reporter/target labels for the moderation queue UI.
 * Status is presentation-only "open" (no persisted moderation status yet).
 */
router.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    const reports = await listAdminModerationReports();
    return res.json(reports);
  })
);

/**
 * US-23.3 — admin moderation report detail.
 * Missing target ⇒ target.exists=false; missing Report ⇒ 404.
 */
router.get(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ error: 'Invalid report id' });
    }

    const view = await getAdminModerationReport(reportId);
    if (!view) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.json(view);
  })
);

router.patch(
  '/verifications/:id',
  asyncHandler(async (req, res) => {
    const { action } = req.body as { action?: string };
    if (!['approve', 'reject'].includes(String(action))) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== 'student') {
      return res.status(404).json({ error: 'Student not found' });
    }
    if (user.verification_status !== 'pending') {
      return res.status(400).json({ error: 'This student account has already been processed' });
    }

    user.verification_status = action === 'approve' ? 'verified' : 'rejected';
    await user.save();

    return res.json({
      id: user._id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      verification_status: user.verification_status,
      created_at: user.created_at.toISOString(),
    });
  })
);

export default router;
