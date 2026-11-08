import { Router } from 'express';
import { one, query } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  verifyCsrf,
  requireUser,
  loginAllowed,
  noteLoginFailure,
  clearLoginFailures,
  safeNext,
} from '../auth.js';
import { isEmail, todayIso } from '../util.js';
import * as view from '../views/site.js';

export const authRoutes = Router();

authRoutes.get('/kirjaudu', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next));
  res.send(view.authPage(req, res, { mode: 'login', next: safeNext(req.query.next) }));
});

authRoutes.post('/kirjaudu', verifyCsrf, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const target = safeNext(req.body.next);
    if (!isEmail(email) || !password) {
      return res.status(400).send(view.authPage(req, res, {
        mode: 'login', next: target, error: 'Täytä sähköposti ja salasana.', values: { email },
      }));
    }
    if (!loginAllowed(req, email)) {
      return res.status(429).send(view.authPage(req, res, {
        mode: 'login', next: target, error: 'Liian monta yritystä. Yritä hetken päästä uudelleen.', values: { email },
      }));
    }
    const user = await one('SELECT * FROM users WHERE email = $1', [email]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      noteLoginFailure(req, email);
      return res.status(401).send(view.authPage(req, res, {
        mode: 'login', next: target, error: 'Sähköposti tai salasana ei täsmää.', values: { email },
      }));
    }
    clearLoginFailures(req, email);
    await createSession(user.id, req, res);
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    res.redirect(target);
  } catch (err) {
    next(err);
  }
});

authRoutes.get('/rekisteroidy', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next));
  res.send(view.authPage(req, res, { mode: 'register', next: safeNext(req.query.next) }));
});

authRoutes.post('/rekisteroidy', verifyCsrf, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const target = safeNext(req.body.next);
    if (!name || !isEmail(email) || password.length < 8) {
      return res.status(400).send(view.authPage(req, res, {
        mode: 'register',
        next: target,
        error: !name ? 'Täytä nimi.' : !isEmail(email) ? 'Tarkista sähköposti.' : 'Salasana tarvitsee vähintään 8 merkkiä.',
        values: { name, email },
      }));
    }
    const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.status(409).send(view.authPage(req, res, {
        mode: 'register', next: target, error: 'Sähköpostilla on jo tunnus. Kirjaudu sisään.', values: { name, email },
      }));
    }
    const passwordHash = await hashPassword(password);
    const user = await one(
      `INSERT INTO users (email, name, password_hash, last_login_at)
       VALUES ($1, $2, $3, now()) RETURNING *`,
      [email, name, passwordHash],
    );
    if (req.org) {
      await query(
        `INSERT INTO memberships (org_id, user_id, role)
         VALUES ($1, $2, (SELECT CASE WHEN count(*) = 0 THEN 'owner' ELSE 'member' END FROM memberships WHERE org_id = $1)::member_role)`,
        [req.org.id, user.id],
      );
    }
    await createSession(user.id, req, res);
    res.redirect(target);
  } catch (err) {
    next(err);
  }
});

authRoutes.post('/ulos', verifyCsrf, async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.redirect('/?ok=uloskirjautunut');
  } catch (err) {
    next(err);
  }
});

authRoutes.get('/salasana', requireUser('/salasana'), (req, res) => {
  res.send(view.passwordPage(req, res));
});

authRoutes.post('/salasana', verifyCsrf, requireUser('/salasana'), async (req, res, next) => {
  try {
    const current = String(req.body.current || '');
    const password = String(req.body.password || '');
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(current, user.password_hash))) {
      return res.status(400).send(view.passwordPage(req, res, { error: 'Nykyinen salasana ei täsmää.' }));
    }
    if (password.length < 8) {
      return res.status(400).send(view.passwordPage(req, res, { error: 'Uusi salasana tarvitsee vähintään 8 merkkiä.' }));
    }
    const hash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, hash]);
    await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    await createSession(user.id, req, res);
    res.redirect('/?ok=salasana-vaihdettu');
  } catch (err) {
    next(err);
  }
});

authRoutes.get('/kayttaja', requireUser('/kayttaja'), (req, res) => {
  res.redirect('/omat-varaukset');
});
