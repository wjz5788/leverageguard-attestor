import express from 'express';
import cookieSession from 'cookie-session';

import { env } from './env';
import { runMigrations } from './db';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import ordersRouter from './routes/orders';
import payoutsRouter from './routes/payouts';

const app = express();

app.use(express.json());
app.use(
  cookieSession({
    name: 'session',
    secret: env.SESSION_SECRET,
    sameSite: 'lax',
    httpOnly: true,
    secure: env.isProduction,
    maxAge: 24 * 60 * 60 * 1000
  })
);

app.use(healthRouter);
app.use(authRouter);
app.use(ordersRouter);
app.use(payoutsRouter);

const start = async () => {
  runMigrations();

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`MVP0 backend listening on port ${env.PORT}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', error);
  process.exit(1);
});
