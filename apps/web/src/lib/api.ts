/**
 * Typed client for the Gold Wallet API (see api-contract.md).
 *
 * Rules enforced here:
 *  - relative URLs under /api/v1, JSON in/out, credentials: 'include'
 *  - every POST except /auth/* and /admin/auth/* must carry an Idempotency-Key
 *    that the CALLER generated once per user action; retries reuse that key
 *  - user client: in-memory access token, one refresh + retry on 401, then /login
 *  - admin client: token in sessionStorage, on 401 clear it and go to /admin/login
 *  - all gold values are integer mg, all money values integer minor units
 */

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type KycStatus = 'NONE' | 'VERIFIED';

export interface Me {
  id: string;
  email: string;
  kycStatus: KycStatus;
  kycName: string | null;
  bankAccount: { holderName: string; ibanMasked: string } | null;
  createdAt: string;
}

export interface Price {
  currency: string;
  currencyDecimals: number;
  spotPerGramMinor: number;
  buyPerGramMinor: number;
  sellPerGramMinor: number;
  direction: 'up' | 'down' | 'flat';
  updatedAt: string;
}

export interface Wallet {
  availableMg: number;
  lockedMg: number;
  currency: string;
  sellPerGramMinor: number;
  availableValueMinor: number;
  totalValueMinor: number;
}

export type QuoteSide = 'BUY' | 'SELL';

export interface Quote {
  id: string;
  side: QuoteSide;
  pricePerGramMinor: number;
  goldMg: number;
  subtotalMinor: number;
  feeMinor: number;
  taxMinor: number;
  /** BUY: amount charged (subtotal + fee + tax). SELL: payout to user (subtotal - fee). */
  totalMinor: number;
  currency: string;
  status: 'OPEN' | 'USED' | 'EXPIRED';
  expiresAt: string;
  serverTime: string;
  createdAt: string;
}

export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'LATE_PAID_REFUND';

export interface Payment {
  id: string;
  purpose: 'BUY' | 'DELIVERY_CHARGES';
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  gatewayOrderId: string;
  checkoutUrl: string;
  goldMg: number | null;
  deliveryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EntryType =
  | 'BUY'
  | 'SELL'
  | 'DELIVERY_LOCK'
  | 'DELIVERY_RELEASE'
  | 'DELIVERY_COMPLETE'
  | 'REVERSAL';

export const ENTRY_TYPES: EntryType[] = [
  'BUY',
  'SELL',
  'DELIVERY_LOCK',
  'DELIVERY_RELEASE',
  'DELIVERY_COMPLETE',
  'REVERSAL',
];

export interface LedgerEntry {
  seq: number;
  type: EntryType;
  availableDeltaMg: number;
  lockedDeltaMg: number;
  amountMinor: number | null;
  currency: string | null;
  refType: 'payment' | 'payout' | 'delivery' | 'reversal';
  refId: string;
  balanceAfter: { availableMg: number; lockedMg: number };
  hash: string;
  createdAt: string;
}

export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  country: string;
  postalCode?: string;
}

export interface DeliveryProduct {
  code: string;
  name: string;
  goldMg: number;
  makingChargeMinor: number;
  shippingMinor: number;
  chargesMinor: number;
}

export type DeliveryStatus = 'REQUESTED' | 'LOCKED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'REQUESTED',
  'LOCKED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

export interface DeliveryHistoryItem {
  status: DeliveryStatus;
  at: string;
  /** 'user' | 'system' | 'admin:<username>' */
  by: string;
}

export interface Delivery {
  id: string;
  product: string;
  productName: string;
  goldMg: number;
  address: Address;
  status: DeliveryStatus;
  chargesMinor: number;
  currency: string;
  chargesPaymentId: string | null;
  chargesStatus: PaymentStatus | null;
  chargesCheckoutUrl: string | null;
  chargesDueBy: string;
  otp: string | null;
  trackingNo: string | null;
  history: DeliveryHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export type AdminRole = 'SUPPORT' | 'OPS' | 'FINANCE';

export interface Admin {
  id: string;
  username: string;
  roles: AdminRole[];
}

export interface AdminLedgerEntry extends LedgerEntry {
  userId: string;
  userEmail: string | null;
  prevHash: string;
  idempotencyKey: string;
  quoteId: string | null;
  /** 'system' or admin username */
  createdBy: string;
}

export interface AdminDelivery extends Omit<Delivery, 'otp'> {
  userId: string;
  userEmail: string | null;
}

export interface AdminRef {
  id: string;
  username: string;
}

export type ReversalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Reversal {
  id: string;
  targetSeq: number;
  userId: string;
  userEmail: string | null;
  availableDeltaMg: number;
  lockedDeltaMg: number;
  reason: string;
  requestedBy: AdminRef;
  approvedBy: AdminRef | null;
  rejectedBy: AdminRef | null;
  status: ReversalStatus;
  postedSeq: number | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface IntegrityFailure {
  check: 'HASH' | 'SEQ' | 'CHAIN_HEAD' | 'BALANCE' | 'STOCK';
  seq?: number;
  userId?: string;
  message: string;
}

export interface IntegrityResult {
  id: string;
  ok: boolean;
  trigger: 'scheduled' | 'manual' | 'test';
  startedAt: string;
  finishedAt: string;
  entriesChecked: number;
  lastSeq: number;
  usersChecked: number;
  totalOwedMg: number;
  physicalStockMg: number;
  failures: IntegrityFailure[];
}

export interface Anchor {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  firstSeq: number;
  lastSeq: number;
  entryCount: number;
  merkleRoot: string;
  status: 'LOCAL_ONLY' | 'SENT' | 'FAILED';
  txHash: string | null;
  explorerUrl: string | null;
  error: string | null;
  createdAt: string;
}

export type AuditActorType = 'user' | 'admin' | 'system' | 'anonymous' | 'gateway';

export const AUDIT_ACTOR_TYPES: AuditActorType[] = ['user', 'admin', 'system', 'anonymous', 'gateway'];

export interface AuditLog {
  id: string;
  actorType: AuditActorType;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// Request / response shapes ---------------------------------------------------

export interface OtpRequestResponse {
  ok: true;
  devOtp?: string;
}

export interface SessionResponse {
  accessToken: string;
  user: Me;
}

export interface KycBody {
  fullName: string;
  idNumber: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
}

export interface BankAccountBody {
  holderName: string;
  iban: string;
}

export type CreateQuoteBody =
  | { side: 'BUY'; amountMinor: number }
  | { side: 'BUY'; goldMg: number }
  | { side: 'SELL'; goldMg: number };

export interface BuyOrderResponse {
  paymentId: string;
  gatewayOrderId: string;
  checkoutUrl: string;
}

export interface SellOrderResponse {
  entrySeq: number;
  goldMg: number;
  payout: {
    id: string;
    status: 'PENDING' | 'PAID' | 'FAILED';
    amountMinor: number;
    currency: string;
  };
  goldRestored: boolean;
  message: string;
}

export interface DeliveryProductsResponse {
  minMg: number;
  currency: string;
  products: DeliveryProduct[];
}

export interface CreateDeliveryBody {
  product: string;
  address: Address;
}

export interface CreateDeliveryResponse {
  delivery: Delivery;
  paymentId: string;
  checkoutUrl: string;
}

export interface VerifyResponse {
  seq: number;
  hash: string;
  anchor: Anchor | null;
  proof: { position: 'left' | 'right'; hash: string }[];
}

export interface AdminLoginResponse {
  token: string;
  admin: Admin;
}

export interface AdminDashboard {
  userCount: number;
  totalAvailableMg: number;
  totalLockedMg: number;
  totalOwedMg: number;
  physicalStockMg: number;
  pendingReversals: number;
  deliveriesByStatus: Record<DeliveryStatus, number>;
  lastIntegrity: IntegrityResult | null;
  lastAnchor: Anchor | null;
  anchorEnabled: boolean;
}

export interface AdminIntegrityResponse {
  latest: IntegrityResult | null;
  anchors: Anchor[];
  anchorEnabled: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  kycStatus: KycStatus;
  availableMg: number;
  lockedMg: number;
  createdAt: string;
}

export interface AdminUserDetail {
  user: Me;
  account: { availableMg: number; lockedMg: number; lastSeq: number };
  entries: LedgerEntry[];
  deliveries: AdminDelivery[];
}

export interface AdminLedgerQuery {
  userId?: string;
  type?: EntryType | '';
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminDeliveryStatusBody {
  status: 'PACKED' | 'SHIPPED' | 'CANCELLED';
  trackingNo?: string;
}

export interface ReversalRequestBody {
  targetSeq: number;
  availableDeltaMg: number;
  lockedDeltaMg: number;
  reason: string;
}

export interface AuditQuery {
  action?: string;
  actorType?: AuditActorType | '';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface DevTotpResponse {
  username: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Turns any thrown value into a message suitable for an inline error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message || e.code;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

async function parseError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`;
  let message = res.statusText || 'Request failed';
  let details: unknown;
  try {
    const text = await res.text();
    if (text) {
      const data = JSON.parse(text) as { error?: { code?: unknown; message?: unknown; details?: unknown } };
      if (data && typeof data === 'object' && data.error) {
        if (typeof data.error.code === 'string') code = data.error.code;
        if (typeof data.error.message === 'string') message = data.error.message;
        details = data.error.details;
      }
    }
  } catch {
    // Non-JSON error body (e.g. proxy error page) — keep the defaults.
  }
  if (res.status >= 500 && code.startsWith('HTTP_')) {
    // No structured error body (e.g. the dev proxy / nginx could not reach the API).
    message = 'The server is unavailable. Please try again in a moment.';
  }
  return new ApiError(res.status, code, message, details);
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

const API_BASE = '/api/v1';

type QueryValue = string | number | undefined | null;
type Query = Record<string, QueryValue>;

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Query;
  /** Generated once per user action by the caller; reused for every retry. */
  idempotencyKey?: string;
  /** Send the bearer token (default true). */
  auth?: boolean;
  /** Run the 401 → refresh → retry / redirect logic (default: same as auth). */
  handle401?: boolean;
  accept?: 'json' | 'text' | 'blob';
  signal?: AbortSignal;
}

interface ClientConfig {
  getToken(): string | null;
  /** Try to obtain a new token; resolve true if it succeeded. */
  refresh?: () => Promise<boolean>;
  onUnauthorized(error: ApiError): void;
}

function buildUrl(path: string, query?: Query): string {
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

function requiresIdempotencyKey(method: string, path: string): boolean {
  return method === 'POST' && !path.startsWith('/auth/') && !path.startsWith('/admin/auth/');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient(config: ClientConfig) {
  return async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? 'GET';
    const auth = opts.auth ?? true;
    const handle401 = opts.handle401 ?? auth;
    const accept = opts.accept ?? 'json';

    if (requiresIdempotencyKey(method, path) && !opts.idempotencyKey) {
      // Programming error: the caller must create one key per user action.
      throw new Error(`POST ${path} requires an Idempotency-Key`);
    }

    const url = buildUrl(path, opts.query);
    let refreshed = false;
    let networkRetries = 0;
    let inProgressRetries = 0;

    for (;;) {
      const headers: Record<string, string> = {
        Accept: accept === 'json' ? 'application/json' : accept === 'text' ? 'text/html, text/plain, */*' : '*/*',
      };
      if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
      if (auth) {
        const token = config.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      let body: string | undefined;
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body ?? {});
      }

      let res: Response;
      try {
        res = await fetch(url, { method, headers, body, credentials: 'include', signal: opts.signal });
      } catch (e) {
        if (opts.signal?.aborted) throw e;
        // A lost connection is safe to retry for GETs and for keyed POSTs:
        // the SAME idempotency key makes the server return the first result.
        const retryable = method === 'GET' || Boolean(opts.idempotencyKey);
        if (retryable && networkRetries < 1) {
          networkRetries += 1;
          await delay(700);
          continue;
        }
        throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
      }

      if (res.ok) {
        if (accept === 'text') return (await res.text()) as unknown as T;
        if (accept === 'blob') return (await res.blob()) as unknown as T;
        if (res.status === 204) return undefined as unknown as T;
        return (await res.json()) as T;
      }

      const error = await parseError(res);

      if (res.status === 401 && handle401) {
        if (!refreshed && config.refresh) {
          refreshed = true;
          const ok = await config.refresh();
          if (ok) continue; // retry once with the new token and the same idempotency key
        }
        config.onUnauthorized(error);
        throw error;
      }

      if (error.code === 'IDEMPOTENCY_IN_PROGRESS' && inProgressRetries < 3) {
        // The first attempt of this same action is still being processed;
        // wait and ask again with the same key to receive its result.
        inProgressRetries += 1;
        await delay(800 * inProgressRetries);
        continue;
      }

      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// User session (in-memory access token, refresh cookie)
// ---------------------------------------------------------------------------

let accessToken: string | null = null;
let refreshInFlight: Promise<SessionResponse | null> | null = null;
let userUnauthorizedHandler: ((error: ApiError) => void) | null = null;
let sessionListener: ((user: Me | null) => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

/** Registered by the auth provider: called when the session is definitively gone. */
export function setUserUnauthorizedHandler(handler: ((error: ApiError) => void) | null): void {
  userUnauthorizedHandler = handler;
}

/** Registered by the auth provider: called whenever a refresh returns a (new) user. */
export function setSessionListener(listener: ((user: Me | null) => void) | null): void {
  sessionListener = listener;
}

const rawRequest = createClient({
  getToken: () => null,
  onUnauthorized: () => undefined,
});

/**
 * POST /auth/refresh using the httpOnly cookie. Concurrent callers share one
 * request. Resolves null (and clears the token) if there is no valid session.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const session = await rawRequest<SessionResponse>('/auth/refresh', { method: 'POST', auth: false });
        accessToken = session.accessToken;
        sessionListener?.(session.user);
        return session;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          accessToken = null;
          return null;
        }
        throw e;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

const userRequest = createClient({
  getToken: () => accessToken,
  refresh: async () => {
    try {
      return (await refreshSession()) !== null;
    } catch {
      return false;
    }
  },
  onUnauthorized: (error) => {
    accessToken = null;
    sessionListener?.(null);
    if (userUnauthorizedHandler) userUnauthorizedHandler(error);
    else if (window.location.pathname !== '/login') window.location.assign('/login');
  },
});

export const api = {
  // Auth ---------------------------------------------------------------------
  requestOtp(email: string): Promise<OtpRequestResponse> {
    return userRequest('/auth/otp/request', { method: 'POST', body: { email }, auth: false });
  },
  async verifyOtp(email: string, otp: string): Promise<SessionResponse> {
    const session = await userRequest<SessionResponse>('/auth/otp/verify', {
      method: 'POST',
      body: { email, otp },
      auth: false,
    });
    accessToken = session.accessToken;
    return session;
  },
  refresh: refreshSession,
  async logout(): Promise<void> {
    try {
      await userRequest<{ ok: true }>('/auth/logout', { method: 'POST', auth: true, handle401: false });
    } finally {
      accessToken = null;
    }
  },

  // Profile ------------------------------------------------------------------
  getMe(): Promise<Me> {
    return userRequest('/me');
  },
  submitKyc(body: KycBody, idempotencyKey: string): Promise<Me> {
    return userRequest('/me/kyc', { method: 'POST', body, idempotencyKey });
  },
  saveBankAccount(body: BankAccountBody, idempotencyKey: string): Promise<Me> {
    return userRequest('/me/bank-account', { method: 'POST', body, idempotencyKey });
  },

  // Prices, wallet, quotes ------------------------------------------------------
  getPrice(signal?: AbortSignal): Promise<Price> {
    return userRequest('/price', { auth: false, signal });
  },
  getWallet(): Promise<Wallet> {
    return userRequest('/wallet');
  },
  createQuote(body: CreateQuoteBody, idempotencyKey: string): Promise<Quote> {
    return userRequest('/quotes', { method: 'POST', body, idempotencyKey });
  },

  // Orders & payments --------------------------------------------------------------
  createBuyOrder(quoteId: string, idempotencyKey: string): Promise<BuyOrderResponse> {
    return userRequest('/orders/buy', { method: 'POST', body: { quoteId }, idempotencyKey });
  },
  /** id may be the paymentId or the gatewayOrderId. */
  getPayment(id: string): Promise<Payment> {
    return userRequest(`/payments/${encodeURIComponent(id)}`);
  },
  createSellOrder(quoteId: string, idempotencyKey: string): Promise<SellOrderResponse> {
    return userRequest('/orders/sell', { method: 'POST', body: { quoteId }, idempotencyKey });
  },

  // Delivery -----------------------------------------------------------------------
  getDeliveryProducts(): Promise<DeliveryProductsResponse> {
    return userRequest('/delivery/products');
  },
  createDelivery(body: CreateDeliveryBody, idempotencyKey: string): Promise<CreateDeliveryResponse> {
    return userRequest('/deliveries', { method: 'POST', body, idempotencyKey });
  },
  listDeliveries(): Promise<{ items: Delivery[] }> {
    return userRequest('/deliveries');
  },
  getDelivery(id: string): Promise<Delivery> {
    return userRequest(`/deliveries/${encodeURIComponent(id)}`);
  },
  cancelDelivery(id: string, idempotencyKey: string): Promise<Delivery> {
    return userRequest(`/deliveries/${encodeURIComponent(id)}/cancel`, { method: 'POST', idempotencyKey });
  },

  // History & receipts ---------------------------------------------------------------
  listTransactions(page: number, pageSize: number): Promise<Paginated<LedgerEntry>> {
    return userRequest('/transactions', { query: { page, pageSize } });
  },
  getReceiptHtml(seq: number): Promise<string> {
    return userRequest(`/transactions/${seq}/receipt`, { accept: 'text' });
  },
  downloadReceipt(seq: number): Promise<Blob> {
    return userRequest(`/transactions/${seq}/receipt`, { query: { download: 1 }, accept: 'blob' });
  },
  verifyEntry(seq: number): Promise<VerifyResponse> {
    return userRequest(`/verify/${seq}`, { auth: false });
  },
};

// ---------------------------------------------------------------------------
// Admin session (token in sessionStorage)
// ---------------------------------------------------------------------------

const ADMIN_TOKEN_KEY = 'goldwallet.adminToken';
let adminUnauthorizedHandler: ((error: ApiError) => void) | null = null;

export function getAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // sessionStorage unavailable (private mode) — the admin will need to log in again.
  }
}

export function setAdminUnauthorizedHandler(handler: ((error: ApiError) => void) | null): void {
  adminUnauthorizedHandler = handler;
}

const adminRequest = createClient({
  getToken: getAdminToken,
  onUnauthorized: (error) => {
    setAdminToken(null);
    if (adminUnauthorizedHandler) adminUnauthorizedHandler(error);
    else if (window.location.pathname !== '/admin/login') window.location.assign('/admin/login');
  },
});

export const adminApi = {
  async login(username: string, password: string, totp: string): Promise<AdminLoginResponse> {
    const res = await adminRequest<AdminLoginResponse>('/admin/auth/login', {
      method: 'POST',
      body: { username, password, totp },
      auth: false,
    });
    setAdminToken(res.token);
    return res;
  },
  async logout(): Promise<void> {
    try {
      await adminRequest<{ ok: true }>('/admin/auth/logout', { method: 'POST', auth: true, handle401: false });
    } finally {
      setAdminToken(null);
    }
  },
  me(): Promise<Admin> {
    return adminRequest('/admin/me');
  },
  dashboard(): Promise<AdminDashboard> {
    return adminRequest('/admin/dashboard');
  },
  integrity(): Promise<AdminIntegrityResponse> {
    return adminRequest('/admin/integrity');
  },
  runIntegrity(idempotencyKey: string): Promise<IntegrityResult> {
    return adminRequest('/admin/integrity/run', { method: 'POST', idempotencyKey });
  },
  users(params: { q?: string; page?: number; pageSize?: number }): Promise<Paginated<AdminUserRow>> {
    return adminRequest('/admin/users', { query: params });
  },
  user(id: string): Promise<AdminUserDetail> {
    return adminRequest(`/admin/users/${encodeURIComponent(id)}`);
  },
  ledger(params: AdminLedgerQuery): Promise<Paginated<AdminLedgerEntry>> {
    return adminRequest('/admin/ledger', { query: { ...params } });
  },
  deliveries(status?: DeliveryStatus | ''): Promise<{ items: AdminDelivery[] }> {
    return adminRequest('/admin/deliveries', { query: { status } });
  },
  setDeliveryStatus(id: string, body: AdminDeliveryStatusBody, idempotencyKey: string): Promise<AdminDelivery> {
    return adminRequest(`/admin/deliveries/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body,
      idempotencyKey,
    });
  },
  completeDelivery(id: string, otp: string, idempotencyKey: string): Promise<AdminDelivery> {
    return adminRequest(`/admin/deliveries/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: { otp },
      idempotencyKey,
    });
  },
  reversals(status?: ReversalStatus | ''): Promise<{ items: Reversal[] }> {
    return adminRequest('/admin/reversals', { query: { status } });
  },
  requestReversal(body: ReversalRequestBody, idempotencyKey: string): Promise<Reversal> {
    return adminRequest('/admin/reversals', { method: 'POST', body, idempotencyKey });
  },
  approveReversal(id: string, idempotencyKey: string): Promise<Reversal> {
    return adminRequest(`/admin/reversals/${encodeURIComponent(id)}/approve`, { method: 'POST', idempotencyKey });
  },
  rejectReversal(id: string, idempotencyKey: string): Promise<Reversal> {
    return adminRequest(`/admin/reversals/${encodeURIComponent(id)}/reject`, { method: 'POST', idempotencyKey });
  },
  auditLogs(params: AuditQuery): Promise<Paginated<AuditLog>> {
    return adminRequest('/admin/audit-logs', { query: { ...params } });
  },
  /** Dev-mode helper: resolves null when the endpoint is disabled (404) or fails. */
  async devTotp(username: string): Promise<DevTotpResponse | null> {
    try {
      return await adminRequest<DevTotpResponse>('/dev/admin-totp', { query: { username }, auth: false });
    } catch {
      return null;
    }
  },
};
