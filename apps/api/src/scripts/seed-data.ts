import { AdminRole } from '../models';

// Demo credentials (local prototype only). TOTP secrets are base32; add them to any
// authenticator app, or run `npm run totp` to print the current codes.
export const SEED_ADMIN_PASSWORD = 'GoldAdmin#2026';

export const SEED_ADMINS: { username: string; roles: AdminRole[]; totpSecret: string }[] = [
  { username: 'finance1', roles: ['FINANCE', 'SUPPORT'], totpSecret: 'GOLDFINANCEONE22' },
  { username: 'finance2', roles: ['FINANCE', 'SUPPORT'], totpSecret: 'GOLDFINANCETWO22' },
  { username: 'ops1', roles: ['OPS', 'SUPPORT'], totpSecret: 'GOLDOPSADMINONE2' },
];

export const SEED_USERS: { email: string; goldMg: number; iban: string | null }[] = [
  { email: 'zero@example.com', goldMg: 0, iban: null },
  { email: 'five@example.com', goldMg: 5000, iban: 'AE070331234567890123456' },
  { email: 'twentyfive@example.com', goldMg: 25000, iban: 'AE460090000000123450000' },
];
