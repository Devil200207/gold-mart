// Seeds admins and demo users. Gold balances are created through the real BUY flow
// (quote → gateway order → signed webhook → ledger posting), never by direct inserts.
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../config/db';
import { Admin, User, UserDoc } from '../models';
import { ensureAccount, initChainHead } from '../services/ledger.service';
import { createBuyOrder } from '../services/order.service';
import { mockGateway } from '../services/payment';
import { createQuote } from '../services/quote.service';
import { saveBankAccount, submitKyc } from '../services/user.service';
import { handlePaymentWebhook } from '../services/webhook.service';
import { SEED_ADMIN_PASSWORD, SEED_ADMINS, SEED_USERS } from './seed-data';

const ctx = { ip: 'seed', userAgent: 'seed-script' };

export async function buyThroughGateway(user: UserDoc, goldMg: number): Promise<void> {
  const quote = await createQuote(user, { side: 'BUY', goldMg });
  const order = await createBuyOrder(user, quote._id);
  const hook = await mockGateway.settleOrder(order.gatewayOrderId, 'pay');
  if (!hook) throw new Error('mock order could not be settled');
  const outcome = await handlePaymentWebhook(Buffer.from(hook.rawBody), hook.signature, ctx);
  if (outcome !== 'credited') throw new Error(`seed buy not credited: ${outcome}`);
}

export async function runSeed(log: (m: string) => void = console.log): Promise<boolean> {
  await initChainHead();
  if (await Admin.exists({ username: SEED_ADMINS[0].username })) {
    log('[seed] already seeded, skipping');
    return false;
  }

  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  for (const a of SEED_ADMINS) {
    await Admin.create({ username: a.username, passwordHash, totpSecret: a.totpSecret, roles: a.roles, active: true });
    log(`[seed] admin ${a.username} (${a.roles.join(', ')})`);
  }

  for (const u of SEED_USERS) {
    let user = (await User.create({ email: u.email })).toObject() as UserDoc;
    await ensureAccount(user._id);
    if (u.iban) {
      await submitKyc(user._id, { fullName: u.email.split('@')[0], idNumber: '784-0000-0000000-0', dateOfBirth: '1990-01-01' }, ctx);
      user = await saveBankAccount(user._id, { holderName: u.email.split('@')[0], iban: u.iban }, ctx);
    }
    if (u.goldMg > 0) await buyThroughGateway(user, u.goldMg);
    log(`[seed] user ${u.email} with ${u.goldMg} mg`);
  }
  return true;
}

if (require.main === module) {
  connectDb()
    .then(() => runSeed())
    .then(() => disconnectDb())
    .catch(async (err) => {
      console.error('[seed] failed', err);
      await disconnectDb();
      process.exit(1);
    });
}
