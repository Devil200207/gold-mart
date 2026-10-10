# Gold Wallet — prototype

A gold-only wallet: users buy gold in any amount, sell it back, or have physical gold delivered (10 g minimum). The app never holds money. Payments go through a (mocked) payment gateway, and the wallet stores only gold, as integer milligrams.

Built from `Gold Wallet App — Prototype Build Spec.md` (MERN + TypeScript, MongoDB 7 replica set).

## Run it

```bash
docker compose up --build
```

| What | URL |
| --- | --- |
| User app (mobile-first) | http://localhost:8080 |
| Admin panel | http://localhost:8080/admin |
| API (direct) | http://localhost:4000/api/v1 |

On start the API container runs, in order: `setup-db-roles` (collections, validators, indexes, restricted DB role and user, using root credentials), `seed` (idempotent), then the server. To start from an empty database: `docker compose down -v`.

## Mock credentials

**Users** sign in with email + OTP. In this local setup (`DEV_EXPOSE_OTP=true`) the code appears on the login screen and in the API log (`docker compose logs api`). Any email works; these are seeded:

| Email | Gold | KYC / bank | Notes |
| --- | --- | --- | --- |
| `zero@example.com` | 0 g | none | Shows the empty and "complete KYC" states |
| `five@example.com` | 5 g | verified, IBAN `AE07…3456` | Payouts succeed; delivery is disabled (< 10 g) |
| `twentyfive@example.com` | 25 g | verified, IBAN `AE46…0000` | Can request delivery. **Its IBAN ends in `0000`, so payouts fail** and the gold is automatically restored |

**Admins** use password + TOTP. The password for all three is `GoldAdmin#2026`.

| Username | Roles | TOTP secret (base32) |
| --- | --- | --- |
| `finance1` | FINANCE, SUPPORT | `GOLDFINANCEONE22` |
| `finance2` | FINANCE, SUPPORT | `GOLDFINANCETWO22` |
| `ops1` | OPS, SUPPORT | `GOLDOPSADMINONE2` |

To get a TOTP code, use any of these:
- the admin login screen shows the current code in dev mode;
- `docker compose exec api node dist/scripts/totp.js`;
- add the secret to an authenticator app.

**Mock gateway checkout** has three buttons: Pay, Fail, and "Pay & send webhook twice" (the idempotency test). The result reaches the API as an HMAC-signed webhook 1–2 s later.

### A 5-minute walkthrough

1. Sign in as `twentyfive@example.com`. **Buy**: enter an amount, Get price, Pay, then pay on the mock checkout page. The return page polls until the verified webhook credits the gold.
2. **Sell** 1 g. The payout fails (IBAN ending `0000`), and the screen explains that the gold was returned. History shows the `SELL` entry and the automatic `REVERSAL`.
3. **Deliver**: choose the 10 g coin, enter an address, and pay the charges. The tracking page then shows the 6-digit delivery code.
4. Admin as `ops1` → Deliveries: Mark packed, then Ship (tracking number), then Complete with the user's code.
5. Admin as `finance1` → Reversals: request a correction against a ledger seq. Then sign in as `finance2` (for example in a private window) and approve it. `finance1` cannot approve their own request.
6. Dashboard → **Run integrity check now**.

## Tests

```bash
cd apps/api
npm install          # the first run downloads a MongoDB 7.0.14 binary for mongodb-memory-server
npm test
```

Jest + Supertest run against a real **single-node replica set with authentication** (mongodb-memory-server). Global setup applies the same `setupDatabase()` used in Docker, and the API connects as the restricted `app_user`, exactly as in Docker. 37 tests:

- the 15 acceptance tests from the spec, plus checks for late payment, KYC-gated selling, the Idempotency-Key replay and the DB-level validators (`test/acceptance.test.ts`);
- a static test that fails if any file other than `ledger.service.ts` imports the ledger models or names the ledger collections (`test/single-write-path.test.ts`);
- unit tests for pricing and rounding, canonical JSON and hashing, Merkle proofs, and delivery transitions (`test/units.test.ts`).

`npm run typecheck` type-checks the API and tests. In `apps/web`, `npm run build` type-checks and builds the frontend.

## Local development without Docker for the app

```bash
docker compose up -d mongo                      # just the database
cd apps/api && cp .env.local.example .env       # host-side connection settings
npm install && npm run setup-db && npm run seed && npm run dev   # API on :4000
cd ../web && npm install && npm run dev                          # web on :5173 (proxies /api and /mock-gateway)
```

Stop the `api` and `web` containers first if they are running, since they hold ports 4000 and 8080. Other scripts in `apps/api`: `npm run totp` and `npm run anchor -- YYYY-MM-DD`.

## How the integrity rules are implemented

| Spec rule | Where |
| --- | --- |
| 1. Single write path | `src/services/ledger.service.ts` is the only importer of `models/ledger.models.ts` (accounts, ledger_entries, chain_head). Enforced by `test/single-write-path.test.ts`. |
| 2. DB lock-down | `src/scripts/db-schema.ts` creates role `goldApp` with **per-collection** privileges: `find`+`insert` only on `ledger_entries` and `audit_logs`, and no `remove` on money/gold collections. The app user has only this role. Indexes and validators are created by the setup script; the app cannot create or drop anything. |
| 3. One transaction per posting | `postInSession()` runs inside `session.withTransaction()` (`src/lib/tx.ts`). The driver retries only on transient errors. Postings that must commit with other writes (payment → PAID, payout record, delivery status) share the caller's transaction. |
| 4. No overdraft | Debits use `findOneAndUpdate({ userId, availableMg: { $gte: n } }, { $inc })`; no match → `INSUFFICIENT_GOLD`. As a second line of defence, the JSON-schema validator rejects negative or fractional balances. |
| 5. Idempotency | Every posting has a key derived from its cause (`buy:<paymentId>`, `sell:<quoteId>`, `delivery-lock:<id>`, `delivery-release:<id>`, `delivery-complete:<id>`, `payout-fail:<payoutId>`, `reversal:<requestId>`), backed by a unique index. A repeat returns the original entry. |
| 6. Integers only | Zod `int().safe()` on every mg and minor-unit field; BigInt for intermediate products (`src/lib/money.ts`); validators use `multipleOf: 1`. The frontend parses and formats with string and integer maths only. |
| 7. Never trust the client | Orders send only `quoteId`; amounts come from the stored quote. |
| 8. Credit only from verified webhooks | `src/services/webhook.service.ts`: constant-time HMAC check → dedupe by `eventId` → exact amount and currency match → PAID + `BUY` posting in one transaction → 200 only after commit. |
| 9. Corrections are reversals | `REVERSAL` entries only. Two-person approval is enforced in `reversal.service.ts` (`requestedBy ≠ approver` is checked in code and in the update filter). |
| 10. Hash chain | `hash = sha256(prevHash + canonicalJson(entry without hash))`; the genesis hash is 64 zeros. |
| 11. Audit | Logins (user and admin, success and failure), admin views of users and the ledger, reversal requests, approvals, rejections and blocked self-approvals, delivery status changes, failed delivery OTPs, invalid webhook signatures, KYC and bank changes, and payout failures. Each records actor, IP and user agent. |

The daily integrity check (00:15 UTC, and on demand from the dashboard) recomputes every hash, checks seq continuity and prevHash links, checks that `chain_head` matches the last entry, compares per-user delta sums with `accounts`, and checks total owed ≤ `PHYSICAL_STOCK_MG`. A failure shows a red banner on every admin page.

### Optional blockchain anchor

A daily job at 00:30 UTC builds a Merkle root over the previous UTC day's entry hashes and stores it in `anchors`. With `ANCHOR_ENABLED=true`, `ANCHOR_RPC_URL` (Polygon Amoy) and `ANCHOR_PRIVATE_KEY` (a funded testnet key), it also sends a zero-value self-transaction whose data is `GOLDLEDGER:<date>:<firstSeq>:<lastSeq>:<root>`; the dashboard links the transaction. `GET /api/v1/verify/:seq` returns the entry hash, its Merkle proof and the anchor. The on-chain send is implemented but **has not been run against Amoy** (no funded key was available). The Merkle and verify path is covered by tests.

## Assumptions and choices (where the spec was silent)

**Pricing**
- Buy price = spot × (1 + spread) rounded **up**; sell price = spot × (1 − spread) rounded **down**. Both are in the house's favour; the spec gives the formula but not the rounding.
- Buy by amount: the entered amount is the subtotal and all of it buys gold (the sub-mg remainder is not refunded). Fee and tax are added on top, so with the defaults (0) the total equals the entered amount.
- Sell-back has no tax: payout = floor(gold × sell price) − flat fee, and it must be > 0.
- The "KYC-based limit flag": until KYC is `VERIFIED`, a single buy is capped at `UNVERIFIED_BUY_LIMIT_MINOR` (default AED 5,000), checked when quoting. Selling requires `VERIFIED` KYC and a bank account.
- A SELL quote is refused up front if it exceeds the available balance. The binding check is still the ledger's conditional debit.

**Payments and payouts**
- The gateway order is created first. Then quote → `USED` and the payment insert happen in one transaction. If that transaction fails, the unused gateway order is simply never paid.
- `payments` has extra fields: `purpose` (`BUY` | `DELIVERY_CHARGES`), `deliveryId`, `checkoutUrl`, `needsManualRefund`, `flagReason`, `ledgerSeq`, `paidAt`. Delivery charges go through the same payment and webhook path.
- An amount or currency mismatch → `FAILED` + `needsManualRefund`. A success that arrives after a failure, or after the delivery was cancelled → `LATE_PAID_REFUND` + `needsManualRefund`. Refunds are flagged for manual handling, not executed (the gateway interface has no refund call).
- `GET /payments/:id` accepts either the payment id or the gateway order id (the mock checkout returns with `?orderId=`).
- The mock settles payouts synchronously: an IBAN ending in `0000` fails, anything else is paid. The webhook handler also accepts `payout.paid` / `payout.failed` for real gateways that answer `PENDING`.
- Known gap: if the API dies between committing the sell debit and calling `createPayout`, the payout stays `PENDING`. A reconciliation job would be needed in production.

**Delivery**
- A request goes straight to `LOCKED`: the delivery record, the charges payment and the `DELIVERY_LOCK` posting are one transaction. `REQUESTED` is never used.
- Each delivery has one charges payment. If it fails, the delivery is cancelled and the gold released, and the user starts a new request. Unpaid charges are released by the per-minute job after 30 minutes.
- An admin cannot mark a delivery packed before its charges are paid (`CHARGES_UNPAID`). Shipping requires a tracking number.
- Delivery OTP: a 6-digit code derived as HMAC(server secret, deliveryId). Only its hash is stored, and it is compared in constant time. This lets the tracking page show the code again without storing it in plaintext. Admin APIs never return it. Wrong attempts are audited; there is no lockout.
- Cancelling after the charges were paid flags that payment for a manual refund. Admins cancel with `POST /admin/deliveries/:id/status {status: "CANCELLED"}`.

**Auth and admin**
- Admins live in their own `admins` collection, so an admin account can never use user endpoints; `users.role` is always `USER`. Seeded admins also have `SUPPORT` so they can view everything.
- The 30-minute admin idle timeout is enforced server-side (`admin_sessions.lastSeenAt` slides on every request).
- User login OTP: 6 digits, valid 10 minutes, 5 attempts, 5 requests per hour per email. Email goes through a console mailer (the API log).
- `DEV_EXPOSE_OTP=true` (on in `.env.example`) returns login OTPs in the API response and enables `GET /api/v1/dev/admin-totp`. **Set it to `false` anywhere but a local demo.**
- Refresh tokens are stateless 7-day JWTs in an httpOnly cookie, rotated on refresh. Logout clears the cookie; there is no server-side revocation list.
- Reversals: the requester enters the deltas, and the user comes from the target entry. Any FINANCE admin may reject; approval needs a different FINANCE admin.

**API**
- `Idempotency-Key` is required on every POST except `/auth/*`, `/admin/auth/*` and the webhook. Keys are stored for 24 h per user or admin. 2xx and 4xx responses are replayed; a 5xx frees the key; reusing a key with a different body → 422.
- Endpoints added because the screens need them: `POST /auth/logout`, `GET /deliveries/:id`, `POST /admin/auth/login|logout`, `GET /admin/me`, `GET /admin/dashboard`, `POST /admin/integrity/run`, `GET /admin/reversals`, `GET /admin/users/:id`, `GET /dev/admin-totp` (dev only), `GET /health`.
- Receipts are HTML (`?download=1` for an attachment).
- Extra collections: `admins`, `admin_sessions`, `otp_codes`, `idempotency_keys`, `integrity_checks`, `mock_gateway_orders` (stands in for the gateway's own storage).
- Rate limits: auth per IP (50 per 15 min), quotes and orders per user (60/min), OTP requests per email (5/h). Helmet, strict CORS to `WEB_ORIGIN`, 32 KB JSON limit.

**Other**
- Mock price feed: integer random walk of up to ±0.2 % every 10 s, pulled 5 % back towards `MOCK_BASE_PRICE_MINOR` each tick.
- `PHYSICAL_STOCK_MG` is a config value.
- The DB validators accept int, long or double with `multipleOf: 1`, because the Node driver stores integers above 2³¹ as doubles. The value must still be integral.
- The MongoDB keyfile (needed for a replica set with auth) is regenerated on each container start; that is fine for a single node.

## Known limits

- `chain_head` serialises all postings: one global sequence means concurrent postings conflict and retry. That is fine for a prototype, but it caps throughput (not measured).
- Mocks stand in for the gateway, KYC provider, price feed and email. Each sits behind an interface (`PaymentGateway`, `PriceProvider`, `Mailer`) so it can be swapped.
- Not built (out of scope): native apps, multi-currency, recurring buys, notifications beyond email.

## Layout

```
gold-wallet/
├── docker-compose.yml        mongo (rs0 + auth) · api · web (nginx)
├── .env.example
├── apps/api/src
│   ├── config/               env, db, delivery products
│   ├── models/               index.ts (general) · ledger.models.ts (restricted)
│   ├── services/             ledger · quote · order · webhook · delivery · reversal · integrity · anchor · auth · payment/ · price/
│   ├── routes/               auth · user · admin · webhook · public · mock-gateway · dev
│   ├── middleware/           auth · idempotency · rate-limit · error
│   ├── jobs/                 quote expiry + delivery timeout (minutely), integrity (00:15 UTC), anchor (00:30 UTC)
│   └── scripts/              db-schema + setup-db-roles · seed · totp · anchor
├── apps/api/test             acceptance · single-write-path · units
└── apps/web/src              pages/ (user) · admin/ · components/ · lib/api.ts, units.ts
```
