import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { attachTenant } from './tenant.js';
import { cookies, loadUser, csrf } from './auth.js';
import { siteRoutes } from './routes/site.js';
import { authRoutes } from './routes/auth.js';
import { instanceRoutes } from './routes/instance.js';
import { adminRoutes } from './routes/admin.js';
import { apiRoutes } from './routes/api.js';
import { notFoundPage, errorPage } from './views/site.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'self'",
    );
    next();
  });

  app.use(express.static(path.join(root, 'public'), { maxAge: '7d', index: false }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookies);
  app.use(loadUser);
  app.use((req, res, next) => {
    if (req.user) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(attachTenant);
  app.use(csrf);

  app.use((req, res, next) => {
    if (req.orgMissing) {
      return res.status(404).send(notFoundPage(req, res, { slug: req.orgMissing }));
    }
    next();
  });

  app.use(authRoutes);
  app.use((req, res, next) => (req.org ? siteRoutes(req, res, next) : next()));
  app.use((req, res, next) => (req.org ? next() : instanceRoutes(req, res, next)));
  app.use('/hallinta', adminRoutes);
  app.use('/api/v1', apiRoutes);

  app.use((req, res) => {
    res.status(404).send(notFoundPage(req, res));
  });

  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).send(errorPage(req, res));
  });

  return app;
}
