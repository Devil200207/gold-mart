import { Types } from 'mongoose';
import { z } from 'zod';
import { DELIVERY_STATUSES } from '../models';
import { ENTRY_TYPES } from '../services/ledger.service';

// Gold (mg) and money (minor units) must be safe integers. Decimals are rejected with 400.
export const mg = z.number({ invalid_type_error: 'must be an integer number of milligrams' }).int('must be an integer number of milligrams').safe();
export const minor = z.number({ invalid_type_error: 'must be an integer number of minor units' }).int('must be an integer number of minor units').safe();

export const objectId = z
  .string()
  .refine((s) => Types.ObjectId.isValid(s) && s.length === 24, 'invalid id')
  .transform((s) => new Types.ObjectId(s));

export const email = z.string().trim().toLowerCase().email().max(254);

export const otpRequestBody = z.object({ email });
export const otpVerifyBody = z.object({ email, otp: z.string().regex(/^\d{6}$/, 'must be 6 digits') });

export const kycBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  idNumber: z.string().trim().min(4).max(40),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
});

export const bankAccountBody = z.object({
  holderName: z.string().trim().min(2).max(120),
  iban: z
    .string()
    .transform((s) => s.replace(/\s/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/, 'invalid IBAN')),
});

export const quoteBody = z.union([
  z.object({ side: z.literal('BUY'), amountMinor: minor.positive(), goldMg: z.undefined().optional() }).strict(),
  z.object({ side: z.literal('BUY'), goldMg: mg.positive(), amountMinor: z.undefined().optional() }).strict(),
  z.object({ side: z.literal('SELL'), goldMg: mg.positive() }).strict(),
]);

export const quoteIdBody = z.object({ quoteId: objectId }).strict();

export const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(30),
  line1: z.string().trim().min(2).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20).optional(),
});
export const deliveryBody = z.object({ product: z.string().min(1).max(40), address: addressSchema }).strict();

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const ledgerQuery = pageQuery.extend({
  userId: objectId.optional(),
  type: z.enum(ENTRY_TYPES).optional(),
  from: day.optional(),
  to: day.optional(),
});

export const auditQuery = pageQuery.extend({
  action: z.string().max(100).optional(),
  actorType: z.enum(['user', 'admin', 'system', 'anonymous', 'gateway']).optional(),
  from: day.optional(),
  to: day.optional(),
});

export const adminLoginBody = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
  totp: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
});

export const deliveryStatusBody = z.object({
  status: z.enum(['PACKED', 'SHIPPED', 'CANCELLED']),
  trackingNo: z.string().trim().min(3).max(60).optional(),
});
export const deliveryStatusQuery = z.object({ status: z.enum(DELIVERY_STATUSES).optional() });
export const completeBody = z.object({ otp: z.string().regex(/^\d{6}$/, 'must be 6 digits') });

export const reversalBody = z.object({
  targetSeq: z.number().int().positive(),
  availableDeltaMg: mg,
  lockedDeltaMg: mg,
  reason: z.string().trim().min(5).max(500),
});

export const seqParam = z.coerce.number().int().positive();
