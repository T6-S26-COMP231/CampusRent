import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { initDatabase } from './db';
import authRoutes from './routes/auth';
import listingRoutes from './routes/listings';
import requestRoutes from './routes/requests';
import adminRoutes from './routes/admin';

initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;
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
  res.json({ status: 'ok', service: 'CampusRent Iteration 1 API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/requests', requestRoutes);
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

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`CampusRent Iteration 1 API running on http://localhost:${PORT}`);
});
