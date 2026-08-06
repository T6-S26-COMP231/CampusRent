import './config/env';
import { createApp } from './app';
import { connectDatabase } from './db/connection';
import { isProduction } from './config/env';

async function start() {
  try {
    await connectDatabase();
    const app = createApp();
    const PORT = Number(process.env.PORT) || 3001;

    app.listen(PORT, () => {
      console.log(`CampusRent API listening on port ${PORT}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup failure';
    console.error(`CampusRent failed to start: ${message}`);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason instanceof Error ? reason.message : reason);
  if (isProduction()) process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
  process.exit(1);
});

void start();
