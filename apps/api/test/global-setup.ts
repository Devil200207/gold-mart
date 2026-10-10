import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { setupDatabase } from '../src/scripts/db-schema';

// A real single-node replica set with authentication, so transactions and the restricted
// app role behave exactly as in Docker.
export default async function globalSetup() {
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', auth: { enable: true, customRootName: 'root', customRootPwd: 'rootpw' } },
  });
  const u = new URL(rs.getUri());
  const replicaSet = u.searchParams.get('replicaSet');
  const dbName = 'gold_test';
  const rootUri = `mongodb://root:rootpw@${u.host}/?replicaSet=${replicaSet}&authSource=admin`;
  await setupDatabase({ rootUri, dbName, appUser: 'app_user', appPassword: 'app_pass' });

  process.env.MONGO_URI = `mongodb://app_user:app_pass@${u.host}/${dbName}?replicaSet=${replicaSet}&authSource=${dbName}`;
  process.env.TEST_ROOT_URI = rootUri;
  process.env.TEST_DB_NAME = dbName;
  (globalThis as unknown as { __MONGO_RS__: MongoMemoryReplSet }).__MONGO_RS__ = rs;
}
