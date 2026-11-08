import { Router } from 'express';
import { many, one, query } from '../db.js';
import { orgUrl, invalidateInstance } from '../tenant.js';
import { createOrganization } from '../orgs.js';
import { isTheme, themeOrDefault, THEMES } from '../themes.js';
import { verifyCsrf } from '../auth.js';
import * as view from '../views/instance.js';

export const instanceRoutes = Router();

async function orgList({ includeParked = false, publicOnly = false } = {}) {
  const where = [];
  if (!includeParked) where.push('o.parked_at IS NULL');
  if (publicOnly) where.push('o.listed_on_instance = true');
  return many(
    `SELECT o.*,
            (SELECT count(*) FROM warehouses w WHERE w.org_id = o.id AND w.archived_at IS NULL)::int AS warehouse_count,
            (SELECT count(*) FROM items i WHERE i.org_id = o.id AND i.archived_at IS NULL)::int AS item_count
     FROM orgs o
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY o.created_at`,
  );
}

instanceRoutes.get('/', async (req, res, next) => {
  try {
    const [orgs, summary] = await Promise.all([
      orgList({ publicOnly: true }),
      one(
        `SELECT
          (SELECT count(*) FROM orgs WHERE parked_at IS NULL AND listed_on_instance = true)::int AS "orgCount",
          (SELECT count(*) FROM warehouses w JOIN orgs o ON o.id = w.org_id
            WHERE w.archived_at IS NULL AND o.parked_at IS NULL AND o.listed_on_instance = true)::int AS "warehouseCount",
          (SELECT count(*) FROM items i JOIN orgs o ON o.id = i.org_id
            WHERE i.archived_at IS NULL AND o.parked_at IS NULL AND o.listed_on_instance = true)::int AS "itemCount"`,
      ),
    ]);
    res.send(view.instanceHome(req, res, { orgs, summary }));
  } catch (err) {
    next(err);
  }
});

instanceRoutes.post('/organisaatiot', verifyCsrf, async (req, res, next) => {
  try {
    if (!req.user) return res.redirect('/kirjaudu?next=/#luo');
    const instance = res.locals.instance;
    if (!instance.allow_org_signup && !req.user.is_superadmin) {
      return res.redirect('/?virhe=oikeus');
    }
    const org = await createOrganization({
      name: req.body.name,
      theme: req.body.theme,
      about: req.body.about,
      ownerId: req.user.id,
      contactEmail: req.user.email,
    });
    invalidateInstance();
    res.redirect(`${orgUrl(req, org, '/?ok=org-luotu')}`);
  } catch (err) {
    if (err.message.includes('nimi')) return res.redirect('/?virhe=puuttuva#luo');
    next(err);
  }
});

instanceRoutes.get('/instanssi', async (req, res, next) => {
  try {
    if (!req.user) return res.redirect('/kirjaudu?next=/instanssi');
    if (!req.user.is_superadmin) return res.status(403).send('Vain instanssin ylläpitäjä voi avata tämän.');
    const [orgs, summary] = await Promise.all([
      orgList({ includeParked: true }),
      one(
        `SELECT
          (SELECT count(*) FROM orgs)::int AS "orgCount",
          (SELECT count(*) FROM warehouses WHERE archived_at IS NULL)::int AS "warehouseCount",
          (SELECT count(*) FROM items WHERE archived_at IS NULL)::int AS "itemCount",
          (SELECT count(*) FROM bookings WHERE status IN ('pending', 'approved'))::int AS "activeBookings"`,
      ),
    ]);
    res.send(view.instanceAdminPage(req, res, { orgs, summary }));
  } catch (err) {
    next(err);
  }
});

instanceRoutes.post('/instanssi', verifyCsrf, async (req, res, next) => {
  try {
    if (!req.user?.is_superadmin) return res.status(403).send('Vain instanssin ylläpitäjä voi muuttaa asetuksia.');
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect('/instanssi?virhe=puuttuva');
    const theme = isTheme(req.body.theme) ? req.body.theme : 'general';
    await query(
      `UPDATE instance_settings
       SET name = $1, theme = $2, footer_note = $3, allow_org_signup = $4, updated_at = now()
       WHERE id = true`,
      [name, theme, String(req.body.footer_note || '').trim() || null, req.body.allow_org_signup === '1'],
    );
    invalidateInstance();
    res.redirect('/instanssi?ok=instanssi-tallennettu');
  } catch (err) {
    next(err);
  }
});

instanceRoutes.post('/instanssi/organisaatiot', verifyCsrf, async (req, res, next) => {
  try {
    if (!req.user?.is_superadmin) return res.status(403).send('Vain instanssin ylläpitäjä voi luoda organisaatioita.');
    const org = await createOrganization({
      name: req.body.name,
      theme: req.body.theme,
      about: '',
      ownerId: req.user.id,
      contactEmail: req.user.email,
    });
    invalidateInstance();
    res.redirect('/instanssi?ok=org-luotu');
  } catch (err) {
    if (err.message.includes('nimi')) return res.redirect('/instanssi?virhe=puuttuva');
    next(err);
  }
});

instanceRoutes.post('/instanssi/organisaatiot/:id/nakyvyys', verifyCsrf, async (req, res, next) => {
  try {
    if (!req.user?.is_superadmin) return res.status(403).send('Vain instanssin ylläpitäjä voi hallita organisaatioita.');
    await query(
      'UPDATE orgs SET listed_on_instance = NOT listed_on_instance WHERE id = $1',
      [req.params.id],
    );
    res.redirect('/instanssi?ok=julkinen-paivitetty');
  } catch (err) {
    next(err);
  }
});

instanceRoutes.post('/instanssi/organisaatiot/:id/park', verifyCsrf, async (req, res, next) => {
  try {
    if (!req.user?.is_superadmin) return res.status(403).send('Vain instanssin ylläpitäjä voi hallita organisaatioita.');
    await query(
      `UPDATE orgs
       SET parked_at = CASE WHEN parked_at IS NULL THEN now() ELSE NULL END
       WHERE id = $1`,
      [req.params.id],
    );
    res.redirect('/instanssi?ok=instanssi-tallennettu');
  } catch (err) {
    next(err);
  }
});
