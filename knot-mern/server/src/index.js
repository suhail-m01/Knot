import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/socket.js';
import { startJobs } from './jobs/index.js';

async function main() {
  await connectDb(env.MONGODB_URI);

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  if (env.jobsEnabled) startJobs();

  const host = process.env.HOST || '0.0.0.0';
  server.listen(env.PORT, host, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, `Knot API listening on http://${host}:${env.PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start Knot API');
  process.exit(1);
});
