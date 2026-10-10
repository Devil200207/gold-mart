// Creates collections, JSON-schema validators, indexes, the restricted `goldApp` role and the
// app's DB user. Must run with root credentials (MONGO_ROOT_URI). Safe to re-run.
import 'dotenv/config';
import { setupDatabase } from './db-schema';

async function main() {
  const rootUri = process.env.MONGO_ROOT_URI;
  if (!rootUri) throw new Error('MONGO_ROOT_URI is required (root credentials)');
  const appUri = new URL(process.env.MONGO_URI ?? '');
  const dbName = appUri.pathname.replace(/^\//, '') || 'gold';
  await setupDatabase({
    rootUri,
    dbName,
    appUser: decodeURIComponent(appUri.username),
    appPassword: decodeURIComponent(appUri.password),
    log: (m) => console.log(`[setup-db] ${m}`),
  });
  console.log('[setup-db] done');
}

main().catch((err) => {
  console.error('[setup-db] failed', err);
  process.exit(1);
});
