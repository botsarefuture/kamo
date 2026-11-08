import { migrate, one, query, closeDb, tx } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@kamo.local';
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'kamo-demo-2026';

await migrate();

let user = await one('SELECT * FROM users WHERE email = $1', [adminEmail]);
let createdUser = false;
if (!user) {
  const passwordHash = await hashPassword(adminPassword);
  user = await one(
    `INSERT INTO users (email, name, password_hash, is_superadmin)
     VALUES ($1, $2, $3, true) RETURNING *`,
    [adminEmail, 'Kamo Ylläpitäjä', passwordHash],
  );
  createdUser = true;
} else if (!user.is_superadmin) {
  await query('UPDATE users SET is_superadmin = true WHERE id = $1', [user.id]);
  user.is_superadmin = true;
}

const orgs = [
  {
    slug: 'mielenosoitukset',
    name: 'Mielenosoitukset.fi',
    theme: 'mielenosoitukset',
    mode: 'approval',
    listed: true,
    about:
      'Kansalaisjärjestöjen äänentoistokalusto lainaan. Varaus hyväksytään ennen noutoa, jotta kalusto riittää kaikille.',
    email: 'kalusto@mielenosoitukset.fi',
    phone: '+358 40 123 4567',
    warehouses: [
      {
        slug: 'kallio',
        name: 'Kallion varasto',
        address: 'Kaarlenkatu 11',
        postal: '00530',
        city: 'Helsinki',
        opening: 'Maanantaisin ja torstaisin 17–20',
        contact: 'Toimistovuoro',
        pickup:
          'Soita ovikelloa ja odota ylläpitäjää. Kalusto on merkitty hyllypaikoittain; ota mukaan varausvahvistus.',
        return:
          'Palauta samaan hyllypaikkaan. Kelaa kaapelit löyhästi ja merkitse rikkoontuneet osat lapulla.',
        items: {
          'JBL SRX828P -subwoofer': 2,
          'QSC K12.2 -aktiivikaiutin': 4,
          'Shure SM58 -mikrofoni': 6,
          'Yamaha MG16XU -mikseri': 1,
          'XLR-kaapeli 10 m': 12,
          'Kaiutinteline': 4,
        },
      },
      {
        slug: 'pasila',
        name: 'Pasilan varasto',
        address: 'Ratapihantie 9',
        postal: '00520',
        city: 'Helsinki',
        opening: 'Sopimuksen mukaan',
        contact: 'Varastovastaava',
        pickup:
          'Nouto Pasilan sisäpihalta, portti B. Soita etukäteen, niin portti avataan.',
        return:
          'Palautus arkisin klo 9–16. Jätä kalusto merkitylle lavalle ja kuittaa palautus ylläpitäjälle.',
        items: {
          'JBL SRX828P -subwoofer': 1,
          'QSC K12.2 -aktiivikaiutin': 2,
          'Shure SM58 -mikrofoni': 4,
          'Yamaha MG16XU -mikseri': 1,
          'XLR-kaapeli 10 m': 8,
          'Kaiutinteline': 2,
          'Virtakaapeli 20 m': 4,
        },
      },
    ],
  },
  {
    slug: 'elokapina',
    name: 'Elokapina',
    theme: 'xr',
    mode: 'hybrid',
    listed: false,
    about:
      'Elokapinan äänentoisto aktioihin ja harjoituksiin. Jäsenet saavat varausvahvistuksen heti; muut voivat lähettää käyttöpyynnön.',
    email: 'aanentoisto@elokapina.fi',
    phone: '',
    warehouses: [
      {
        slug: 'sornainen',
        name: 'Sörnäisten varasto',
        address: 'Hämeentie 48',
        postal: '00500',
        city: 'Helsinki',
        opening: 'Keskiviikkoisin 18–20',
        contact: 'Aktioviritys',
        pickup:
          'Soita ovikelloa ja kysy äänentoistoa. Nouda vain varausvahvistuksessa mainitut nimikkeet.',
        return:
          'Palauta seuraavaan aktioviritykseen mennessä. Merkitse puuttuvat kaapelit erikseen.',
        items: {
          'RCF ART 715-A': 2,
          'Shure SM58': 4,
          'Behringer XR18': 1,
          'XLR-kaapeli 10 m': 8,
          'Kaiutinteline': 2,
        },
      },
    ],
  },
  {
    slug: 'kamo-yhdistys',
    name: 'Kamo-yhdistys',
    theme: 'general',
    mode: 'approval',
    listed: true,
    about: 'Yhdistyksen yhteinen kalusto Tampereella. Varaukset hyväksyy varastovastaava.',
    email: 'kalusto@kamo-yhdistys.fi',
    phone: '',
    warehouses: [
      {
        slug: 'tampere',
        name: 'Tampere varasto',
        address: 'Itsenäisyydenkatu 21',
        postal: '33100',
        city: 'Tampere',
        opening: 'Tiistaisin 17–19',
        contact: 'Varastovastaava',
        pickup: 'Nouto sisäpihalta, ovi 2. Soita soittoääni ja odota.',
        return: 'Palautus samaan paikkaan. Tarkista kaapelit ennen palautusta.',
        items: {
          'Yamaha DXR12': 2,
          'Sennheiser e835': 4,
          'Allen & Heath ZED-12FX': 1,
        },
      },
    ],
  },
];

const categories = ['Kaiuttimet', 'Mikrofonit', 'Mikserit', 'Kaapelit', 'Telineet'];

for (const data of orgs) {
  let org = await one('SELECT * FROM orgs WHERE slug = $1', [data.slug]);
  if (!org) {
    org = await one(
      `INSERT INTO orgs (slug, name, theme, about, contact_email, contact_phone, booking_mode, max_booking_days, min_notice_days, listed_on_instance)
       VALUES ($1, $2, $3, $4, $5, $6, $7::booking_mode, 30, 2, $8)
       RETURNING *`,
      [data.slug, data.name, data.theme, data.about, data.email, data.phone || null, data.mode, data.listed],
    );
  } else {
    await query(
      `UPDATE orgs SET theme = $2, booking_mode = $3::booking_mode, about = $4, contact_email = $5,
         contact_phone = $6, listed_on_instance = $7, updated_at = now()
       WHERE id = $1`,
      [org.id, data.theme, data.mode, data.about, data.email, data.phone || null, data.listed],
    );
  }

  await query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner'`,
    [org.id, user.id],
  );

  const catIds = new Map();
  for (const [index, name] of categories.entries()) {
    const category = await one(
      `INSERT INTO categories (org_id, name, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order
       RETURNING *`,
      [org.id, name, (index + 1) * 10],
    );
    catIds.set(name, category.id);
  }

  const itemIds = new Map();
  for (const warehouse of data.warehouses) {
    let wh = await one(
      'SELECT * FROM warehouses WHERE org_id = $1 AND slug = $2',
      [org.id, warehouse.slug],
    );
    if (!wh) {
      wh = await one(
        `INSERT INTO warehouses
          (org_id, slug, name, address, postal_code, city, opening_info, contact_name,
           pickup_instructions, return_instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          org.id,
          warehouse.slug,
          warehouse.name,
          warehouse.address,
          warehouse.postal,
          warehouse.city,
          warehouse.opening,
          warehouse.contact,
          warehouse.pickup,
          warehouse.return,
        ],
      );
    } else {
      await query(
        `UPDATE warehouses SET name = $2, address = $3, postal_code = $4, city = $5,
           opening_info = $6, contact_name = $7, pickup_instructions = $8,
           return_instructions = $9, updated_at = now()
         WHERE id = $1`,
        [
          wh.id,
          warehouse.name,
          warehouse.address,
          warehouse.postal,
          warehouse.city,
          warehouse.opening,
          warehouse.contact,
          warehouse.pickup,
          warehouse.return,
        ],
      );
    }

    for (const [name, quantity] of Object.entries(warehouse.items)) {
      const categoryName =
        name.includes('mikrofoni') || name.includes('SM58') || name.includes('e835')
          ? 'Mikrofonit'
          : name.includes('mikseri') || name.includes('XR18') || name.includes('ZED')
            ? 'Mikserit'
            : name.includes('kaapeli')
              ? 'Kaapelit'
              : name.includes('teline')
                ? 'Telineet'
                : 'Kaiuttimet';
      let itemId = itemIds.get(name);
      if (!itemId) {
        const existing = await one(
          'SELECT id FROM items WHERE org_id = $1 AND name = $2 AND archived_at IS NULL ORDER BY created_at LIMIT 1',
          [org.id, name],
        );
        if (existing) {
          itemId = existing.id;
        } else {
          const item = await one(
            `INSERT INTO items (org_id, category_id, name, unit)
             VALUES ($1, $2, $3, 'kpl') RETURNING *`,
            [org.id, catIds.get(categoryName), name],
          );
          itemId = item.id;
        }
        itemIds.set(name, itemId);
      }
      await query(
        `INSERT INTO stock (org_id, warehouse_id, item_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (warehouse_id, item_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [org.id, wh.id, itemId, quantity],
      );
    }
  }
}

console.log('Seed complete.');
console.log(`Admin: ${adminEmail}`);
if (createdUser) {
  console.log(`Password: ${adminPassword}`);
} else {
  console.log('Existing admin kept; password was not changed.');
}
console.log('Organization demo URLs: /?org=mielenosoitukset, /?org=elokapina, /?org=kamo-yhdistys');

await closeDb();
