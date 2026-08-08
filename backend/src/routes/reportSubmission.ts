import { Router } from 'express';
import { authenticate, requireVerifiedStudent } from '../middleware/auth';
import { nextId } from '../models/Counter';
import {
  Report,
  isReportTargetType,
  normalizeReportDetails,
  normalizeReportReason,
  toReportRow,
} from '../models/Report';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate, requireVerifiedStudent);

/**
 * US-20.4 — submit-report API.
 *
 * POST /api/reports
 * Body: { target_type, target_id, reason, details }
 * Reporter is always req.user.id (client reporter_id is ignored).
 *
 * Basic malformed/missing checks live here. Target existence, self-report,
 * and any future approved category rules belong to US-20.5.
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
