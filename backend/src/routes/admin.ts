import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import { aggregateActivityReport } from '../utils/activityAggregation';
import { normalizeActivityFilters } from '../utils/activityMetrics';
import { performAdminModerationAction } from '../utils/adminModerationAction';
import { ModerationActionError } from '../utils/moderationActions';
import {
  getAdminModerationReport,
  listAdminModerationReports,
} from '../utils/moderationReports';

const router = Router();
router.use(authenticate, requireAdmin);

/**
 * US-24.4 / US-24.5 — platform activity aggregate / activity summary.
 * Optional query: start_date, end_date, activity_scope, listing_category.
 * Invalid filters → 400. Zero matches → 200 with has_data false.
 * Admin-only via authenticate + requireAdmin on this router.
 */
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const { filters, error } = normalizeActivityFilters({
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      activity_scope: req.query.activity_scope,
      listing_category: req.query.listing_category,
    });
    if (error) {
      return res.status(400).json({ error });
    }

    const report = await aggregateActivityReport(filters, new Date());
    return res.status(200).json(report);
  })
);

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
 * US-23.3 / US-23.5 — admin moderation report list.
 * Returns the same Report documents created by POST /api/reports,
 * with resolved reporter/target labels and persisted moderation status.
 */
router.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    const reports = await listAdminModerationReports();
    return res.json(reports);
  })
);

/**
 * US-23.3 / US-23.5 — admin moderation report detail.
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

/**
 * US-23.5 — execute a moderation action on a report.
 * administrator_id comes from auth only; target comes from the Report only.
 * Client administrator_id / target_id / target_type are ignored.
 */
router.post(
  '/reports/:id/actions',
  asyncHandler(async (req, res) => {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ error: 'Invalid report id' });
    }

    // Ignore any client administrator_id / target_id / target_type — auth + Report only.
    const { action } = (req.body ?? {}) as { action?: unknown };

    try {
      const result = await performAdminModerationAction(
        reportId,
        action,
        req.user!.id
      );
      return res.status(200).json({
        action: result.action,
        report: result.report,
        target: result.target,
        audit: result.audit,
        message: result.decision.message,
      });
    } catch (error) {
      if (error instanceof ModerationActionError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      throw error;
    }
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
