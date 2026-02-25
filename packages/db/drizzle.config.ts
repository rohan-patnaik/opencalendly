import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
const neonHostPattern = /\.neon\.tech(?::\d+)?(?:\/|$)/i;

if (!url) {
  // drizzle-kit reads this file in CLI context, fail fast with a clear message.
  throw new Error('DATABASE_URL is required for Drizzle migrations.');
}

if (!neonHostPattern.test(url)) {
  throw new Error('DATABASE_URL must point to Neon Postgres (*.neon.tech).');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
  strict: true,
  verbose: true,
});
