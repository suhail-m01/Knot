import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// Load the project-level .env first, then a server-level .env if present.
dotenv.config({
  path: [path.resolve(here, '../../../.env'), path.resolve(process.cwd(), '.env')],
  quiet: true,
});

export const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-before-production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/knot'),
  JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  ENABLE_JOBS: z.enum(['true', 'false']).default('true'),
  JOB_CRON: z.string().default('*/5 * * * *'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  console.error(`Invalid environment configuration: ${details}`);
  process.exit(1);
}

const data = parsed.data;
if (data.NODE_ENV === 'production' && data.JWT_SECRET === DEV_JWT_SECRET) {
  console.error('JWT_SECRET must be set to a strong secret when NODE_ENV=production.');
  process.exit(1);
}

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  clientOrigins: data.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  jobsEnabled: data.ENABLE_JOBS === 'true',
};
