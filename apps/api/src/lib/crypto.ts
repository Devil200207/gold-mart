import crypto from 'crypto';

export const sha256 = (input: string | Buffer): string => crypto.createHash('sha256').update(input).digest('hex');

export const hmacSha256 = (secret: string, input: string | Buffer): string =>
  crypto.createHmac('sha256', secret).update(input).digest('hex');

/** Constant-time comparison of two hex/ascii strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const randomDigits = (n: number): string => {
  let out = '';
  for (let i = 0; i < n; i++) out += crypto.randomInt(0, 10).toString();
  return out;
};

export const randomId = (prefix: string) => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
