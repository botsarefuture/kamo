import { tx } from './db.js';
import { slugify } from './util.js';
import { isTheme } from './themes.js';

export async function createOrganization({ name, theme, about, ownerId, contactEmail = null }) {
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw new Error('Organisaation nimi on liian lyhyt.');

  return tx(async (client) => {
    const base = slugify(cleanName) || 'organisaatio';
    let slug = base;
    let counter = 2;
    while ((await client.query('SELECT 1 FROM orgs WHERE slug = $1', [slug])).rowCount) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    const { rows } = await client.query(
      `INSERT INTO orgs (slug, name, theme, about, contact_email, booking_mode, max_booking_days, min_notice_days)
       VALUES ($1, $2, $3, $4, $5, 'approval', 30, 2)
       RETURNING *`,
      [slug, cleanName, isTheme(theme) ? theme : 'general', String(about || '').trim(), contactEmail],
    );
    const org = rows[0];
    await client.query(
      'INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
      [org.id, ownerId, 'owner'],
    );
    for (const [index, category] of ['Kaiuttimet', 'Mikrofonit', 'Vahvistimet', 'Kaapelit', 'Telineet'].entries()) {
      await client.query(
        'INSERT INTO categories (org_id, name, sort_order) VALUES ($1, $2, $3)',
        [org.id, category, (index + 1) * 10],
      );
    }
    return org;
  });
}
