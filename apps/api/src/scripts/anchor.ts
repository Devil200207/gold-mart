// Runs the daily anchor for a given UTC date: npm run anchor -- 2026-10-07 (default: yesterday).
import { connectDb, disconnectDb } from '../config/db';
import { runDailyAnchor } from '../services/anchor.service';

async function main() {
  await connectDb();
  const date = process.argv[2];
  const a = await runDailyAnchor(date);
  console.log(a ? JSON.stringify(a, null, 2) : 'No ledger entries for that day; nothing anchored.');
  await disconnectDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
