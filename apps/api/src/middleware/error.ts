import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError('NOT_FOUND', 'Route not found'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  const e = err as { type?: string; status?: number; code?: number; message?: string };
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON' } });
  if (e?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request too large' } });
  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
