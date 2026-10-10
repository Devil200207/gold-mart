// Prints the current TOTP code for each seeded admin.
import { authenticator } from 'otplib';
import { SEED_ADMIN_PASSWORD, SEED_ADMINS } from './seed-data';

console.log(`password for all seeded admins: ${SEED_ADMIN_PASSWORD}`);
for (const a of SEED_ADMINS) {
  console.log(`${a.username.padEnd(10)} ${authenticator.generate(a.totpSecret)}   (secret ${a.totpSecret})`);
}
