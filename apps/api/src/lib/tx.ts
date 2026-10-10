import mongoose, { ClientSession } from 'mongoose';

/**
 * Runs fn inside one MongoDB transaction. The driver retries the whole callback on
 * TransientTransactionError / UnknownTransactionCommitResult only; any other error aborts
 * and is rethrown, so nothing is written. Keep external calls (gateway, email) out of fn.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}
