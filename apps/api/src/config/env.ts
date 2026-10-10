import 'dotenv/config';
import { z } from 'zod';

const int = (def: number) => z.coerce.number().int().default(def);
const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: int(4000),
  MONGO_URI: z.string().default('mongodb://app_user:app_pass@localhost:27017/gold?replicaSet=rs0'),
  JWT_SECRET: z.string().min(8).default('change-me-dev-secret'),
  ACCESS_TOKEN_TTL_SECONDS: int(900),
  REFRESH_TOKEN_TTL_DAYS: int(7),
  ADMIN_IDLE_TIMEOUT_MINUTES: int(30),

  // Browser-facing origin of the web app (also the origin that proxies /api and /mock-gateway).
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:5173'),
  // Where the mock gateway delivers its webhooks (the API itself).
  WEBHOOK_URL: z.string().optional(),

  CURRENCY: z.string().default('AED'),
  CURRENCY_DECIMALS: int(2),
  MOCK_BASE_PRICE_MINOR: int(30000),
  PRICE_TICK_SECONDS: int(10),
  BUY_SPREAD_BPS: int(150),
  SELL_SPREAD_BPS: int(150),
  FLAT_FEE_MINOR: int(0),
  TAX_RATE_BPS: int(0),
  MIN_BUY_MINOR: int(100),
  UNVERIFIED_BUY_LIMIT_MINOR: int(500000),
  QUOTE_TTL_SECONDS: int(180),

  DELIVERY_MIN_MG: int(10000),
  DELIVERY_CHARGE_PAYMENT_TIMEOUT_MIN: int(30),
  PHYSICAL_STOCK_MG: int(5000000),

  MOCK_GATEWAY_SECRET: z.string().default('change-me'),
  DELIVERY_OTP_SECRET: z.string().optional(),

  RATE_LIMIT_AUTH_PER_15MIN: int(50),
  RATE_LIMIT_TRADE_PER_MIN: int(60),
  OTP_REQUESTS_PER_HOUR: int(5),

  JOBS_ENABLED: bool(true),
  DEV_EXPOSE_OTP: bool(false),

  ANCHOR_ENABLED: bool(false),
  ANCHOR_RPC_URL: z.string().default(''),
  ANCHOR_PRIVATE_KEY: z.string().default(''),
  ANCHOR_EXPLORER_TX_URL: z.string().default('https://amoy.polygonscan.com/tx/'),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

export const webhookUrl = () => env.WEBHOOK_URL || `http://127.0.0.1:${env.PORT}/api/v1/webhooks/payment`;
export const deliveryOtpSecret = () => env.DELIVERY_OTP_SECRET || `${env.JWT_SECRET}:delivery-otp`;
