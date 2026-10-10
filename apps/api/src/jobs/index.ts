import { runDailyAnchor } from '../services/anchor.service';
import { releaseExpiredDeliveries } from '../services/delivery.service';
import { runIntegrityCheck } from '../services/integrity.service';
import { expireStaleQuotes } from '../services/quote.service';

const timers: NodeJS.Timeout[] = [];

const safe = (name: string, fn: () => Promise<unknown>) => async () => {
  try {
    await fn();
  } catch (err) {
    console.error(`[jobs] ${name} failed`, err);
  }
};

/** Runs fn every day at hh:mm UTC. */
export function scheduleDailyUtc(hour: number, minute: number, fn: () => Promise<unknown>): void {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const t = setTimeout(async () => {
    await fn();
    scheduleDailyUtc(hour, minute, fn);
  }, next.getTime() - now.getTime());
  t.unref();
  timers.push(t);
}

export function startJobs(): void {
  const everyMinute = setInterval(
    safe('minutely', async () => {
      await expireStaleQuotes();
      const released = await releaseExpiredDeliveries();
      if (released) console.log(`[jobs] released ${released} unpaid deliveries`);
    }),
    60_000,
  );
  everyMinute.unref();
  timers.push(everyMinute);

  scheduleDailyUtc(0, 15, safe('integrity', async () => {
    const r = await runIntegrityCheck('scheduled');
    console.log(`[jobs] integrity check ${r.ok ? 'passed' : 'FAILED'} (${r.entriesChecked} entries)`);
  }));
  scheduleDailyUtc(0, 30, safe('anchor', () => runDailyAnchor()));
}

export function stopJobs(): void {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
}
