// Collections, validators, indexes and the app's restricted DB role.
// Applied with root credentials by setup-db-roles.ts (also used by the test suite).
import { MongoClient, IndexDescription } from 'mongodb';

const INT = { bsonType: ['int', 'long', 'double'], multipleOf: 1 };
const NON_NEG_INT = { ...INT, minimum: 0 };
const HASH = { bsonType: 'string', minLength: 64, maxLength: 64 };

export const VALIDATORS: Record<string, object> = {
  ledger_entries: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['seq', 'userId', 'type', 'availableDeltaMg', 'lockedDeltaMg', 'refType', 'refId', 'idempotencyKey', 'balanceAfter', 'prevHash', 'hash', 'createdBy', 'createdAt'],
      properties: {
        seq: { ...INT, minimum: 1 },
        userId: { bsonType: 'objectId' },
        type: { enum: ['BUY', 'SELL', 'DELIVERY_LOCK', 'DELIVERY_RELEASE', 'DELIVERY_COMPLETE', 'REVERSAL'] },
        availableDeltaMg: INT,
        lockedDeltaMg: INT,
        amountMinor: { bsonType: ['int', 'long', 'double', 'null'], multipleOf: 1 },
        currency: { bsonType: ['string', 'null'] },
        quoteId: { bsonType: ['objectId', 'null'] },
        refType: { enum: ['payment', 'payout', 'delivery', 'reversal'] },
        refId: { bsonType: 'objectId' },
        idempotencyKey: { bsonType: 'string', minLength: 1 },
        balanceAfter: {
          bsonType: 'object',
          required: ['availableMg', 'lockedMg'],
          properties: { availableMg: NON_NEG_INT, lockedMg: NON_NEG_INT },
        },
        prevHash: HASH,
        hash: HASH,
        createdBy: { bsonType: ['string', 'objectId'] },
        createdAt: { bsonType: 'date' },
      },
    },
  },
  accounts: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'availableMg', 'lockedMg', 'lastSeq'],
      properties: {
        userId: { bsonType: 'objectId' },
        availableMg: NON_NEG_INT,
        lockedMg: NON_NEG_INT,
        lastSeq: NON_NEG_INT,
        updatedAt: { bsonType: 'date' },
      },
    },
  },
};

export const INDEXES: Record<string, IndexDescription[]> = {
  ledger_entries: [
    { key: { seq: 1 }, unique: true, name: 'seq_unique' },
    { key: { idempotencyKey: 1 }, unique: true, name: 'idempotencyKey_unique' },
    { key: { userId: 1, seq: 1 }, name: 'user_seq' },
    { key: { createdAt: 1 }, name: 'createdAt' },
  ],
  accounts: [{ key: { userId: 1 }, unique: true, name: 'userId_unique' }],
  chain_head: [],
  users: [{ key: { email: 1 }, unique: true, name: 'email_unique' }],
  admins: [{ key: { username: 1 }, unique: true, name: 'username_unique' }],
  admin_sessions: [{ key: { lastSeenAt: 1 }, expireAfterSeconds: 86_400, name: 'ttl' }],
  otp_codes: [
    { key: { email: 1, createdAt: -1 }, name: 'email_createdAt' },
    { key: { createdAt: 1 }, expireAfterSeconds: 86_400, name: 'ttl' },
  ],
  idempotency_keys: [
    { key: { scope: 1, key: 1 }, unique: true, name: 'scope_key_unique' },
    { key: { createdAt: 1 }, expireAfterSeconds: 86_400, name: 'ttl' },
  ],
  quotes: [{ key: { status: 1, expiresAt: 1 }, name: 'status_expiresAt' }],
  payments: [
    { key: { gatewayOrderId: 1 }, unique: true, name: 'gatewayOrderId_unique' },
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
  ],
  payouts: [
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
    { key: { gatewayPayoutId: 1 }, name: 'gatewayPayoutId' },
  ],
  deliveries: [
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
    { key: { status: 1, chargesDueBy: 1 }, name: 'status_due' },
  ],
  reversal_requests: [{ key: { status: 1, createdAt: -1 }, name: 'status_createdAt' }],
  audit_logs: [
    { key: { createdAt: -1 }, name: 'createdAt' },
    { key: { action: 1, createdAt: -1 }, name: 'action_createdAt' },
  ],
  integrity_checks: [{ key: { finishedAt: -1 }, name: 'finishedAt' }],
  anchors: [{ key: { date: 1 }, unique: true, name: 'date_unique' }],
  mock_gateway_orders: [{ key: { gatewayId: 1 }, unique: true, name: 'gatewayId_unique' }],
};

// What the app's DB user may do. Privileges are listed per collection on purpose: a db-wide
// grant would also cover ledger_entries and audit_logs.
const APPEND_ONLY = ['find', 'insert'];
const NO_DELETE = ['find', 'insert', 'update'];
const FULL = ['find', 'insert', 'update', 'remove'];
export const APP_PRIVILEGES: Record<string, string[]> = {
  ledger_entries: APPEND_ONLY,
  audit_logs: APPEND_ONLY,
  accounts: NO_DELETE,
  chain_head: NO_DELETE,
  users: NO_DELETE,
  payments: NO_DELETE,
  payouts: NO_DELETE,
  deliveries: NO_DELETE,
  reversal_requests: NO_DELETE,
  quotes: NO_DELETE,
  integrity_checks: NO_DELETE,
  anchors: NO_DELETE,
  admins: NO_DELETE,
  admin_sessions: FULL,
  otp_codes: FULL,
  idempotency_keys: FULL,
  mock_gateway_orders: FULL,
};

export const APP_ROLE = 'goldApp';

export interface SetupOptions {
  rootUri: string;
  dbName: string;
  appUser: string;
  appPassword: string;
  log?: (msg: string) => void;
}

export async function setupDatabase(o: SetupOptions): Promise<void> {
  const log = o.log ?? (() => undefined);
  const client = await MongoClient.connect(o.rootUri);
  try {
    const db = client.db(o.dbName);
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

    for (const name of Object.keys(APP_PRIVILEGES)) {
      const validator = VALIDATORS[name];
      if (!existing.has(name)) {
        await db.createCollection(name, validator ? { validator, validationLevel: 'strict', validationAction: 'error' } : {});
        log(`created collection ${name}`);
      } else if (validator) {
        await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
      }
      const idx = INDEXES[name] ?? [];
      if (idx.length) await db.collection(name).createIndexes(idx);
    }

    const privileges = Object.entries(APP_PRIVILEGES).map(([collection, actions]) => ({
      resource: { db: o.dbName, collection },
      actions,
    }));
    const roles = await db.command({ rolesInfo: APP_ROLE });
    if (roles.roles.length) await db.command({ updateRole: APP_ROLE, privileges, roles: [] });
    else await db.command({ createRole: APP_ROLE, privileges, roles: [] });
    log(`role ${APP_ROLE} ready`);

    const users = await db.command({ usersInfo: o.appUser });
    if (users.users.length) await db.command({ updateUser: o.appUser, pwd: o.appPassword, roles: [{ role: APP_ROLE, db: o.dbName }] });
    else await db.command({ createUser: o.appUser, pwd: o.appPassword, roles: [{ role: APP_ROLE, db: o.dbName }] });
    log(`user ${o.appUser} ready (role ${APP_ROLE} only)`);
  } finally {
    await client.close();
  }
}
