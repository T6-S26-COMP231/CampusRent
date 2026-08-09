import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import { Listing } from '../models/Listing';
import {
  Report,
  isReportTargetType,
  normalizeReportDetails,
  normalizeReportReason,
  toReportRow,
} from '../models/Report';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

/**
 * US-20.4 / US-20.5 — submit-report API.
 *
 * POST /api/reports
 * Body: { target_type, target_id, reason, details }
 * Reporter is always req.user.id (client reporter_id is ignored).
 *
 * US-20.5 adds target existence checks against the correct collection for
 * target_type, plus complete malformed-field handling. Reason remains required
 * free text — GitHub #147 / TAC define no approved category list. No invented
 * self-report, duplicate, or details max-length rules.
 *
 * File name avoids backend/src/routes/reports.ts, which Iteration 1 verify
 * still treats as a forbidden placeholder path.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { target_type, target_id, reason, details } = req.body as {
      target_type?: unknown;
      target_id?: unknown;
      reason?: unknown;
      details?: unknown;
      reporter_id?: unknown;
    };

    // Client-supplied reporter_id (if present) is ignored — auth is the only source.

    if (target_type === undefined || target_type === null || target_type === '') {
      return res.status(400).json({ error: 'target_type is required' });
    }
    if (!isReportTargetType(target_type)) {
      return res.status(400).json({ error: 'target_type must be user or listing' });
    }

    if (target_id === undefined || target_id === null || target_id === '') {
      return res.status(400).json({ error: 'target_id is required' });
    }
    if (typeof target_id === 'boolean') {
      return res.status(400).json({ error: 'target_id must be a positive integer' });
    }
    const targetId = Number(target_id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'target_id must be a positive integer' });
    }

    if (reason === undefined || reason === null) {
      return res.status(400).json({ error: 'reason is required' });
    }
    if (typeof reason !== 'string') {
      return res.status(400).json({ error: 'reason must be a string' });
    }

    if (details === undefined || details === null) {
      return res.status(400).json({ error: 'details are required' });
    }
    if (typeof details !== 'string') {
      return res.status(400).json({ error: 'details must be a string' });
    }

    let normalizedReason: string;
    let normalizedDetails: string;
    try {
      normalizedReason = normalizeReportReason(reason);
      normalizedDetails = normalizeReportDetails(details);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid report payload',
      });
    }

    // Target existence is checked against the collection matching target_type only.
    if (target_type === 'user') {
      const user = await User.findById(targetId).select('_id').lean();
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else {
      const listing = await Listing.findById(targetId).select('_id').lean();
      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }
    }

    const reporterId = req.user!.id;

    let created;
    try {
      created = await Report.create({
        _id: await nextId('reports'),
        reporter_id: reporterId,
        target_type,
        target_id: targetId,
        reason: normalizedReason,
        details: normalizedDetails,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'ValidationError' || error.name === 'CastError')
      ) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    return res.status(201).json(toReportRow(created));
  })
);

export default router;
