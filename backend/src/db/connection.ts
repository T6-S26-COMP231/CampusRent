import mongoose from 'mongoose';
import { requireMongoUri } from '../config/env';

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDatabase(uri = requireMongoUri()): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connecting) {
    connecting = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
      })
      .then((connection) => {
        console.log('Database connection established');
        return connection;
      })
      .catch((error: unknown) => {
        connecting = null;
        const message = error instanceof Error ? error.message : 'Unknown database error';
        // Never log the URI or credentials — only a safe failure reason.
        throw new Error(`Database connection failed: ${sanitizeDbError(message)}`);
      });
  }

  return connecting;
}

export async function disconnectDatabase(): Promise<void> {
  connecting = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function getDatabaseStatus(): {
  connected: boolean;
  readyState: 'disconnected' | 'connected' | 'connecting' | 'disconnecting';
} {
  const states: Record<number, 'disconnected' | 'connected' | 'connecting' | 'disconnecting'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: states[mongoose.connection.readyState] || 'disconnected',
  };
}

function sanitizeDbError(message: string): string {
  return message
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, '[redacted-connection-string]')
    .replace(/pass(word)?[=:][^\s,]+/gi, 'password=[redacted]');
}
