import { NextFunction, Request, Response } from 'express';
import { canonicalJson } from '../lib/canonical-json';
import { sha256 } from '../lib/crypto';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { IdempotencyKey } from '../models';

/**
 * Every state-changing POST must carry an Idempotency-Key. The first response (2xx or 4xx) is
 * stored and replayed for repeats of the same key; a 5xx frees the key so the client can retry.
 */
export const idempotency = (scopeOf: (req: Request) => string) => async (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'POST') return next();
  try {
    const key = req.get('idempotency-key');
    if (!key || key.length > 200) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    const scope = scopeOf(req);
    const path = req.originalUrl.split('?')[0];
    const bodyHash = sha256(canonicalJson(req.body ?? {}));

    try {
      await IdempotencyKey.create({ scope, key, method: req.method, path, bodyHash, state: 'IN_PROGRESS' });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const prior = await IdempotencyKey.findOne({ scope, key }).lean();
      if (!prior) throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Request with this key is being processed');
      if (prior.path !== path || prior.bodyHash !== bodyHash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used for a different request');
      }
      if (prior.state !== 'DONE') throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Request with this key is being processed');
      res.setHeader('Idempotent-Replay', 'true');
      res.status(prior.responseStatus ?? 200).json(prior.responseBody);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      const store =
        status >= 500
          ? IdempotencyKey.deleteOne({ scope, key })
          : IdempotencyKey.updateOne({ scope, key }, { $set: { state: 'DONE', responseStatus: status, responseBody: body } });
      store.then(
        () => originalJson(body),
        (e) => {
          console.error('[idempotency] failed to store response', e);
          originalJson(body);
        },
      );
      return res;
    };
    next();
  } catch (err) {
    next(err);
  }
};
