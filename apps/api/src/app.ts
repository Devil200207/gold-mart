import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/error';
import { adminRouter } from './routes/admin.routes';
import { authRouter } from './routes/auth.routes';
import { devRouter } from './routes/dev.routes';
import { mockGatewayRouter } from './routes/mock-gateway.routes';
import { publicRouter } from './routes/public.routes';
import { userRouter } from './routes/user.routes';
import { webhookRouter } from './routes/webhook.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

  // Webhooks need the raw body, so they are mounted before the JSON parser.
  app.use('/api/v1/webhooks', webhookRouter);

  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/mock-gateway', mockGatewayRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/dev', devRouter);
  app.use('/api/v1', publicRouter);
  app.use('/api/v1', userRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
