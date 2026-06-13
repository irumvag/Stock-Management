import { neon } from '@neondatabase/serverless';

// Single Neon HTTP client reused across invocations. DATABASE_URL is provided
// by Vercel env (or .env during `vercel dev`).
export const sql = neon(process.env.DATABASE_URL);
