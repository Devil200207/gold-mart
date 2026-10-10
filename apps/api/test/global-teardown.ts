import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalTeardown() {
  const rs = (globalThis as unknown as { __MONGO_RS__?: MongoMemoryReplSet }).__MONGO_RS__;
  if (rs) await rs.stop();
}
