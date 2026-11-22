// Shared test harness. Tests run against a real MongoDB (TEST_MONGODB_URI, default local mongod).
// Each test file gets a clean database, so files can run in sequence safely.
process.env.NODE_ENV = 'test';
process.env.ENABLE_JOBS = 'false';
process.env.JWT_SECRET ||= 'test-only-secret-that-is-long-enough-1234';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/knot_test';

const { connectDb, disconnectDb } = await import('../src/config/db.js');
const mongoose = (await import('mongoose')).default;

export async function setupTestDb() {
  await connectDb(process.env.MONGODB_URI);
  await mongoose.connection.db.dropDatabase();
  await mongoose.connection.syncIndexes?.();
  const models = await import('../src/models/index.js');
  // Ensure indexes exist before concurrency tests run.
  await Promise.all(Object.values(models).filter((m) => m?.createCollection).map((m) => m.createCollection().catch(() => {})));
  await Promise.all(Object.values(models).filter((m) => m?.syncIndexes).map((m) => m.syncIndexes()));
  const { createApp } = await import('../src/app.js');
  return { app: createApp(), models };
}

export async function teardownTestDb() {
  await mongoose.connection.db?.dropDatabase().catch(() => {});
  await disconnectDb();
}

export const future = (days, hours = 0) => new Date(Date.now() + days * 86400000 + hours * 3600000).toISOString();

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}
