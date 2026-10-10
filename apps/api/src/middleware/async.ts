import { NextFunction, Request, RequestHandler, Response } from 'express';
import { RequestContext } from '../services/audit.service';

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const ctxOf = (req: Request): RequestContext => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });
