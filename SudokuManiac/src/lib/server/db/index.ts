import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

/**
 * Serverless functions reach the database through a transaction-mode pooler
 * (Supabase's port 6543, Neon's `-pooler` host). Such a pooler hands each
 * transaction to whichever server connection is free, so a prepared statement
 * made on one may be missing on the next — postgres-js must not prepare.
 * Costs a little parse time; works the same on a direct connection.
 */
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
