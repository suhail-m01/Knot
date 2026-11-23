import mongoose from 'mongoose';
import { logger } from './logger.js';

/**
 * Connects Mongoose to MongoDB. Works with a local mongod, Docker, or MongoDB Atlas
 * (set MONGODB_URI accordingly). Indexes are created automatically on connect.
 */
export async function connectDb(uri) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info({ database: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export const dbReady = () => mongoose.connection.readyState === 1;
