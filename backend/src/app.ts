import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import listingRoutes from './routes/listings';
import guestListingRoutes from './routes/guestListings';
import requestRoutes from './routes/requests';
import conversationRoutes from './routes/conversations';
import reportSubmissionRoutes from './routes/reportSubmission';
import reviewSubmissionRoutes from './routes/reviewSubmission';
import profileRoutes from './routes/profile';
import adminRoutes from './routes/admin';
import { getDatabaseStatus } from './db/connection';

export function createApp() {
  const app = express();
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configuredOrigins,
  ];

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/api/health', (_req, res) => {
    const database = getDatabaseStatus();
    const healthy = database.connected;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      service: 'CampusRent API',
      database: {
        connected: database.connected,
        readyState: database.readyState,
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/listings', listingRoutes);
  // US-01.3 — public limited guest previews (no auth). Keep separate from /api/listings.
  app.use('/api/guest/listings', guestListingRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/reports', reportSubmissionRoutes);
  app.use('/api/reviews', reviewSubmissionRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/admin', adminRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Each image must be 5 MB or smaller' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'A listing can contain a maximum of 5 images' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (
      err.message.includes('images') ||
      err.message.includes('JPG') ||
      err.message.includes('CORS')
    ) {
      return res.status(400).json({ error: err.message });
    }

    // User-input schema failures are client errors, not database outages.
    if (
      err instanceof mongoose.Error.ValidationError ||
      err instanceof mongoose.Error.CastError ||
      err.name === 'ValidationError' ||
      err.name === 'CastError'
    ) {
      return res.status(400).json({ error: err.message });
    }

    const isDatabaseError =
      err.name === 'MongoServerError' ||
      err.name === 'MongoNetworkError' ||
      err.name === 'MongoNotConnectedError' ||
      err.name === 'MongooseError' ||
      err instanceof mongoose.Error ||
      /buffering timed out|Client must be connected|before calling `MongoClient/i.test(
        err.message
      );

    if (isDatabaseError) {
      console.error('Database request error:', err.name || 'DatabaseError');
      return res.status(503).json({ error: 'Database unavailable. Please try again later.' });
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
