import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export function getNodeEnv(): string {
  return process.env.NODE_ENV || 'development';
}

export function isProduction(): boolean {
  return getNodeEnv() === 'production';
}

/**
 * Resolves the MongoDB connection URI.
 * Production requires MONGODB_URI and never falls back to local JSON storage.
 */
export function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error(
      isProduction()
        ? 'MONGODB_URI is required in production. Configure a persistent MongoDB connection string in the host environment.'
        : 'MONGODB_URI is required. Set it in backend/.env (see .env.example). Local JSON storage is not supported.'
    );
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(
      'MONGODB_URI is invalid. Expected a mongodb:// or mongodb+srv:// connection string.'
    );
  }

  return uri;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (isProduction()) {
    throw new Error('JWT_SECRET is required in production.');
  }
  return 'campusrent-dev-secret-change-in-production';
}
