import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';
import { startJobs } from './jobs';
import { initChainHead } from './services/ledger.service';
import { priceProvider } from './services/price';

async function main() {
  await connectDb();
  await initChainHead();
  priceProvider.start();
  createApp().listen(env.PORT, () => console.log(`[api] listening on :${env.PORT}`));
  if (env.JOBS_ENABLED) startJobs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
