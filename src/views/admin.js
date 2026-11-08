import { e, fiDate, fiDateRange, fiDateTime, statusLabel, bookingModeLabel } from '../util.js';
import { THEMES } from '../themes.js';
import { renderPage } from './layout.js';
import { flash, badge, emptyState, stat, csrfInput, themeSwatches } from './components.js';

function adminPage(req, res, { title, tab, body, description = '' }) {
  return renderPage(req, res, {
    title,
    description,
    body: `${flash(req)}${body}`,
    adminTab: tab,
    bodyClass: 'admin-surface',
  });
}

function bookingRows(bookings) {
  return bookings.map((booking) => `<tr>
    <td><a class="ref" href="/hallinta/varaukset/${e(booking.id)}">${e(booking.reference)}</a><span class="row-note">${e(booking.user_name || 'Tuntematon')}</span></td>
    <td>${fiDateRange(booking.starts_on, booking.ends_on)}</td>
    <td>${e(booking.warehouse_name)}</td>
    <td class="num">${Number(booking.units || 0)}</td>
    <td>${badge(booking.status)}</td>
  </tr>`).join('');
}

export function dashboardPage(req, res, data) {
  const { counts, pending, recent } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>Hallinta</h1>
      <p class="lead">Varaukset, kalusto ja varastot yhdestä paikasta.</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="/hallinta/kalusto">Lisää kalustoa</a>
        <a class="btn btn--quiet" href="/hallinta/varaukset">Selaa varauksia</a>
      </div>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      <div class="stat-grid">
        ${stat('Odottaa hyväksyntää', counts.pending)}
        ${stat('Tulevat hyväksytyt', counts.approvedUpcoming)}
        ${stat('Nimikkeitä', counts.items)}
        ${stat('Varastoja', counts.warehouses)}
      </div>
      <div class="grid grid--2">
        <div class="card">
          <div class="section__head section__head--small"><h2>Odottaa hyväksyntää</h2><a class="arrow-link" href="/hallinta/varaukset?status=pending">Kaikki</a></div>
          ${pending.length ? `<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Varaus</th><th>Aikaväli</th><th>Varasto</th><th class="num">Yks.</th><th>Tila</th></tr></thead><tbody>${bookingRows(pending)}</tbody></table></div>` : emptyState('Ei odottavia varauksia', 'Kaikki saapuneet varaukset on käsitelty.')}
        </div>
        <div class="card">
          <div class="section__head section__head--small"><h2>Viimeisimmät varaukset</h2><a class="arrow-link" href="/hallinta/varaukset">Kaikki</a></div>
          ${recent.length ? `<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Varaus</th><th>Aikaväli</th><th>Varasto</th><th class="num">Yks.</th><th>Tila</th></tr></thead><tbody>${bookingRows(recent)}</tbody></table></div>` : emptyState('Ei varauksia', 'Ensimmäinen varaus ilmestyy tähän.')}
        </div>
      </div>
      <div class="card card--spaced">
        <h2>Varauskäytäntö</h2>
        <p class="muted">${bookingModeLabel(req.org.booking_mode)} · vähintään ${Number(req.org.min_notice_days)} päivää ennen · enintään ${Number(req.org.max_booking_days)} päivää.</p>
        <a class="arrow-link" href="/hallinta/asetukset">Muuta asetuksia</a>
      </div>
    </div>
  </section>`;
  return adminPage(req, res, { title: 'Hallinta', tab: 'dashboard', body });
}

export function bookingsPage(req, res, data) {
  const { bookings, filters, warehouses } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>Varaukset</h1>
      <p class="lead">Kaikki organisaation varaukset. Hyväksy, hylkää ja merkitse palautetuksi.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      <form class="filterbar" method="get" action="/hallinta/varaukset">
        <label class="field"><span>Tila</span><select name="status">
          <option value="">Kaikki</option>
          ${['pending', 'approved', 'rejected', 'cancelled', 'returned'].map((s) => `<option value="${s}"${filters.status === s ? ' selected' : ''}>${e(statusLabel(s))}</option>`).join('')}
        </select></label>
        <label class="field"><span>Varasto</span><select name="warehouse">
          <option value="">Kaikki</option>
          ${warehouses.map((w) => `<option value="${e(w.id)}"${filters.warehouseId === w.id ? ' selected' : ''}>${e(w.name)}</option>`).join('')}
        </select></label>
        <button class="btn btn--primary" type="submit">Rajaa</button>
        ${filters.status || filters.warehouseId ? '<a class="linkish" href="/hallinta/varaukset">Tyhjennä</a>' : ''}
      </form>
      ${bookings.length ? `<div class="table-wrap card"><table class="table">
        <thead><tr><th>Varaus</th><th>Aikaväli</th><th>Varasto</th><th class="num">Yksiköt</th><th>Tila</th></tr></thead>
        <tbody>${bookingRows(bookings)}</tbody>
      </table></div>` : emptyState('Ei varauksia', 'Rajauksilla ei löytynyt varauksia.')}
    </div>
  </section>`;
  return adminPage(req, res, { title: 'Varaukset', tab: 'bookings', body });
}

export function bookingDetailPage(req, res, data) {
  const { booking } = data;
  const canDecide = booking.status === 'pending';
  const canClose = booking.status === 'approved';
  const body = `
  <section class="page-head">
    <div class="container">
      <a class="backlink" href="/hallinta/varaukset">Varaukset</a>
      <div class="title-row"><h1>${e(booking.reference)}</h1>${badge(booking.status)}</div>
      <p class="lead">${e(booking.warehouse_name)} · ${fiDateRange(booking.starts_on, booking.ends_on)}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="stack">
        <div class="card">
          <h2>Kalusto</h2>
          <div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>Nimike</th><th class="num">Määrä</th></tr></thead>
            <tbody>${booking.items.map((item) => `<tr><td>${e(item.name)}</td><td class="num">${Number(item.quantity)} ${e(item.unit)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <h2>Yhteystiedot</h2>
          <dl class="facts facts--stack">
            <div><dt>Nimi</dt><dd>${e(booking.contact_name)}</dd></div>
            <div><dt>Sähköposti</dt><dd><a href="mailto:${e(booking.contact_email)}">${e(booking.contact_email)}</a></dd></div>
            <div><dt>Puhelin</dt><dd>${e(booking.contact_phone || 'Ei ilmoitettu')}</dd></div>
            <div><dt>Käyttötarkoitus</dt><dd>${e(booking.purpose || 'Ei ilmoitettu')}</dd></div>
            <div><dt>Luotu</dt><dd>${fiDateTime(booking.created_at)}</dd></div>
            ${booking.approved_at ? `<div><dt>Hyväksytty</dt><dd>${fiDateTime(booking.approved_at)}</dd></div>` : ''}
            ${booking.returned_at ? `<div><dt>Palautettu</dt><dd>${fiDateTime(booking.returned_at)}</dd></div>` : ''}
          </dl>
          ${booking.admin_note ? `<p class="note">${e(booking.admin_note)}</p>` : ''}
        </div>
      </div>
      <aside class="stack">
        ${canDecide ? `<div class="card">
          <h2>Käsittele varaus</h2>
          <form method="post" action="/hallinta/varaukset/${e(booking.id)}/tila">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Viesti asiakkaalle</span><textarea name="note" rows="3" placeholder="Valinnainen lisäys vahvistukseen"></textarea></label>
            <div class="form-actions">
              <button class="btn btn--primary" type="submit" name="status" value="approved">Hyväksy</button>
              <button class="btn btn--danger" type="submit" name="status" value="rejected">Hylkää</button>
            </div>
          </form>
        </div>` : ''}
        ${canClose ? `<div class="card">
          <h2>Päätä laina</h2>
          <form method="post" action="/hallinta/varaukset/${e(booking.id)}/tila">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Muistiinpano</span><textarea name="note" rows="3"></textarea></label>
            <div class="form-actions">
              <button class="btn btn--primary" type="submit" name="status" value="returned">Merkitse palautetuksi</button>
              <button class="btn btn--quiet" type="submit" name="status" value="cancelled">Peruuta varaus</button>
            </div>
          </form>
        </div>` : ''}
        <div class="card">
          <h2>Varaston ohjeet</h2>
          <p class="muted">${e([booking.warehouse_address, booking.warehouse_city].filter(Boolean).join(', '))}</p>
          <a class="arrow-link" href="/varastot/${e(booking.warehouse_id)}">Avaa varasto</a>
        </div>
      </aside>
    </div>
  </section>`;
  return adminPage(req, res, { title: booking.reference, tab: 'bookings', body });
}

export function itemsPage(req, res, data) {
  const { items, categories } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>Kalusto</h1>
      <p class="lead">Nimikkeet, kategoriat ja saldot. Saldot annetaan varastokohtaisesti.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="card">
        <div class="section__head section__head--small"><h2>Nimikkeet</h2><span class="count">${items.length} kpl</span></div>
        ${items.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Nimike</th><th>Kategoria</th><th>Yksikkö</th><th class="num">Saldot</th></tr></thead>
          <tbody>${items.map((item) => `<tr>
            <td><a href="/hallinta/kalusto/${e(item.id)}">${e(item.name)}</a>${item.description ? `<span class="row-note">${e(item.description)}</span>` : ''}</td>
            <td>${e(item.category_name || 'Ei kategoriaa')}</td>
            <td>${e(item.unit)}</td>
            <td class="num">${Number(item.total_stock || 0)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : emptyState('Ei nimikkeitä', 'Lisää ensimmäinen nimike lomakkeella.')}
      </div>
      <aside class="stack">
        <div class="card">
          <h2>Lisää nimike</h2>
          <form method="post" action="/hallinta/kalusto">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Nimi</span><input name="name" required></label>
            <label class="field"><span>Kategoria</span><select name="category_id"><option value="">Ei kategoriaa</option>${categories.map((c) => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Yksikkö</span><input name="unit" value="kpl" required></label>
            <label class="field"><span>Kuvaus</span><textarea name="description" rows="3"></textarea></label>
            <button class="btn btn--primary btn--block" type="submit">Lisää nimike</button>
          </form>
        </div>
        <div class="card">
          <h2>Lisää kategoria</h2>
          <form method="post" action="/hallinta/kategoriat">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Nimi</span><input name="name" required></label>
            <label class="field"><span>Järjestys</span><input name="sort_order" type="number" value="100" min="0"></label>
            <button class="btn btn--quiet btn--block" type="submit">Lisää kategoria</button>
          </form>
        </div>
      </aside>
    </div>
  </section>`;
  return adminPage(req, res, { title: 'Kalusto', tab: 'items', body });
}

export function itemDetailPage(req, res, data) {
  const { item, categories, warehouses, stockByWarehouse } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <a class="backlink" href="/hallinta/kalusto">Kalusto</a>
      <h1>${e(item.name)}</h1>
      <p class="lead">${e(item.category_name || 'Ei kategoriaa')} · ${e(item.unit)}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="card">
        <h2>Nimikkeen tiedot</h2>
        <form method="post" action="/hallinta/kalusto/${e(item.id)}">
          ${csrfInput(res.locals.csrfToken)}
          <label class="field"><span>Nimi</span><input name="name" value="${e(item.name)}" required></label>
          <div class="grid grid--2">
            <label class="field"><span>Kategoria</span><select name="category_id"><option value="">Ei kategoriaa</option>${categories.map((c) => `<option value="${e(c.id)}"${item.category_id === c.id ? ' selected' : ''}>${e(c.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Yksikkö</span><input name="unit" value="${e(item.unit)}" required></label>
          </div>
          <label class="field"><span>Kuvaus</span><textarea name="description" rows="4">${e(item.description || '')}</textarea></label>
          <div class="form-actions"><button class="btn btn--primary" type="submit">Tallenna tiedot</button></div>
        </form>
      </div>
      <aside class="stack">
        <div class="card">
          <h2>Saldot varastoittain</h2>
          <form method="post" action="/hallinta/kalusto/${e(item.id)}/saldo">
            ${csrfInput(res.locals.csrfToken)}
            ${warehouses.length ? warehouses.map((w) => `<label class="field field--inline"><span>${e(w.name)}</span><input name="stock_${e(w.id)}" type="number" min="0" value="${Number(stockByWarehouse[w.id] || 0)}"></label>`).join('') : '<p class="muted">Lisää ensin varasto.</p>'}
            <button class="btn btn--primary btn--block" type="submit">Tallenna saldot</button>
          </form>
        </div>
        <div class="card">
          <h2>Arkistointi</h2>
          <p class="muted">Arkistoitu nimike ei näy varauslomakkeessa eikä kalustosivulla.</p>
          <form method="post" action="/hallinta/kalusto/${e(item.id)}/arkistoi">
            ${csrfInput(res.locals.csrfToken)}
            <button class="btn btn--danger" type="submit">Arkistoi nimike</button>
          </form>
        </div>
      </aside>
    </div>
  </section>`;
  return adminPage(req, res, { title: item.name, tab: 'items', body });
}

export function warehousesPage(req, res, data) {
  const { warehouses } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>Varastot</h1>
      <p class="lead">Osoitteet, yhteystiedot ja nouto-ohjeet.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="stack">
        ${warehouses.length ? warehouses.map((w) => `<article class="card warehouse-card">
          <div class="warehouse-card__top"><h2><a href="/hallinta/varastot/${e(w.id)}">${e(w.name)}</a></h2><span class="count">${Number(w.item_count || 0)} nimikettä</span></div>
          <p class="muted">${e([w.address, w.postal_code, w.city].filter(Boolean).join(', '))}</p>
          <p>${e(w.opening_info || 'Aukioloa ei ilmoitettu.')}</p>
          <a class="arrow-link" href="/hallinta/varastot/${e(w.id)}">Muokkaa</a>
        </article>`).join('') : emptyState('Ei varastoja', 'Lisää ensimmäinen varasto lomakkeella.')}
      </div>
      <aside class="card">
        <h2>Lisää varasto</h2>
        <form method="post" action="/hallinta/varastot">
          ${csrfInput(res.locals.csrfToken)}
          <label class="field"><span>Nimi</span><input name="name" required></label>
          <label class="field"><span>Osoite</span><input name="address"></label>
          <div class="grid grid--2">
            <label class="field"><span>Postinumero</span><input name="postal_code"></label>
            <label class="field"><span>Kaupunki</span><input name="city" value="Helsinki"></label>
          </div>
          <label class="field"><span>Yhteyshenkilö</span><input name="contact_name"></label>
          <div class="grid grid--2">
            <label class="field"><span>Sähköposti</span><input name="contact_email" type="email"></label>
            <label class="field"><span>Puhelin</span><input name="contact_phone"></label>
          </div>
          <label class="field"><span>Aukiolo</span><input name="opening_info" placeholder="Esim. ma–to 17–20"></label>
          <label class="field"><span>Nouto-ohjeet</span><textarea name="pickup_instructions" rows="3"></textarea></label>
          <label class="field"><span>Palautusohjeet</span><textarea name="return_instructions" rows="3"></textarea></label>
          <button class="btn btn--primary btn--block" type="submit">Lisää varasto</button>
        </form>
      </aside>
    </div>
  </section>`;
  return adminPage(req, res, { title: 'Varastot', tab: 'warehouses', body });
}

export function warehouseDetailPage(req, res, data) {
  const { warehouse, stockRows } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <a class="backlink" href="/hallinta/varastot">Varastot</a>
      <h1>${e(warehouse.name)}</h1>
      <p class="lead">${e([warehouse.address, warehouse.postal_code, warehouse.city].filter(Boolean).join(', '))}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="card">
        <h2>Varaston tiedot</h2>
        <form method="post" action="/hallinta/varastot/${e(warehouse.id)}">
          ${csrfInput(res.locals.csrfToken)}
          <label class="field"><span>Nimi</span><input name="name" value="${e(warehouse.name)}" required></label>
          <label class="field"><span>Osoite</span><input name="address" value="${e(warehouse.address || '')}"></label>
          <div class="grid grid--2">
            <label class="field"><span>Postinumero</span><input name="postal_code" value="${e(warehouse.postal_code || '')}"></label>
            <label class="field"><span>Kaupunki</span><input name="city" value="${e(warehouse.city || '')}"></label>
          </div>
          <label class="field"><span>Yhteyshenkilö</span><input name="contact_name" value="${e(warehouse.contact_name || '')}"></label>
          <div class="grid grid--2">
            <label class="field"><span>Sähköposti</span><input name="contact_email" type="email" value="${e(warehouse.contact_email || '')}"></label>
            <label class="field"><span>Puhelin</span><input name="contact_phone" value="${e(warehouse.contact_phone || '')}"></label>
          </div>
          <label class="field"><span>Aukiolo</span><input name="opening_info" value="${e(warehouse.opening_info || '')}"></label>
          <label class="field"><span>Karttalinkki</span><input name="map_url" type="url" value="${e(warehouse.map_url || '')}"></label>
          <label class="field"><span>Nouto-ohjeet</span><textarea name="pickup_instructions" rows="4">${e(warehouse.pickup_instructions || '')}</textarea></label>
          <label class="field"><span>Palautusohjeet</span><textarea name="return_instructions" rows="4">${e(warehouse.return_instructions || '')}</textarea></label>
          <div class="form-actions"><button class="btn btn--primary" type="submit">Tallenna varasto</button></div>
        </form>
      </div>
      <aside class="stack">
        <div class="card">
          <h2>Varaston saldot</h2>
          <form method="post" action="/hallinta/varastot/${e(warehouse.id)}/saldo">
            ${csrfInput(res.locals.csrfToken)}
            ${stockRows.length ? stockRows.map((row) => `<label class="field field--inline"><span>${e(row.name)}</span><input name="stock_${e(row.id)}" type="number" min="0" value="${Number(row.quantity)}"></label>`).join('') : '<p class="muted">Lisää ensin nimikkeitä.</p>'}
            <button class="btn btn--primary btn--block" type="submit">Tallenna saldot</button>
          </form>
        </div>
        <div class="card">
          <h2>Arkistointi</h2>
          <form method="post" action="/hallinta/varastot/${e(warehouse.id)}/arkistoi">
            ${csrfInput(res.locals.csrfToken)}
            <button class="btn btn--danger" type="submit">Arkistoi varasto</button>
          </form>
        </div>
      </aside>
    </div>
  </section>`;
  return adminPage(req, res, { title: warehouse.name, tab: 'warehouses', body });
}

export function settingsPage(req, res) {
  const org = req.org;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>Asetukset</h1>
      <p class="lead">Ulkoasu, varauskäytäntö ja yhteystiedot.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      <form method="post" action="/hallinta/asetukset">
        ${csrfInput(res.locals.csrfToken)}
        <div class="card">
          <h2>Teema</h2>
          <p class="muted">Teema vaihtaa värit, fontit ja muodon koko sivustolla.</p>
          <div class="theme-grid">
            ${Object.entries(THEMES).map(([key, theme]) => `<label class="theme-option">
              <input type="radio" name="theme" value="${e(key)}"${org.theme === key ? ' checked' : ''}>
              <span class="theme-option__body">
                ${themeSwatches(key)}
                <strong>${e(theme.label)}</strong>
                <span>${e(theme.description)}</span>
              </span>
            </label>`).join('')}
          </div>
        </div>

        <div class="card card--spaced">
          <h2>Varauskäytäntö</h2>
          <div class="grid grid--2">
            <label class="field"><span>Hyväksyntätapa</span><select name="booking_mode">
              <option value="login"${org.booking_mode === 'login' ? ' selected' : ''}>Kirjautunut jäsen saa varauksen heti</option>
              <option value="hybrid"${org.booking_mode === 'hybrid' ? ' selected' : ''}>Jäsenet heti, muut hakemuksella</option>
              <option value="approval"${org.booking_mode === 'approval' ? ' selected' : ''}>Ylläpitäjä hyväksyy kaikki varaukset</option>
            </select></label>
            <label class="field"><span>Pisin varaus (päivää)</span><input name="max_booking_days" type="number" min="1" max="180" value="${Number(org.max_booking_days)}"></label>
            <label class="field"><span>Ennakkoaika (päivää)</span><input name="min_notice_days" type="number" min="0" max="60" value="${Number(org.min_notice_days)}"></label>
          </div>
        </div>

        <div class="card card--spaced">
          <h2>Yhteystiedot ja esittely</h2>
          <div class="grid grid--2">
            <label class="field"><span>Sähköposti</span><input name="contact_email" type="email" value="${e(org.contact_email || '')}"></label>
            <label class="field"><span>Puhelin</span><input name="contact_phone" value="${e(org.contact_phone || '')}"></label>
          </div>
          <label class="field"><span>Lyhyt esittely</span><textarea name="about" rows="4">${e(org.about || '')}</textarea></label>
        </div>

        <div class="card card--spaced">
          <h2>Oma verkkotunnus ja näkyvyys</h2>
          <p class="muted">Organisaatio voi toimia omalla verkkotunnuksellaan ilman Kamo-nimeä. DNS ja TLS hoidetaan palvelimen puolella; tässä kerrotaan vain täsmällinen host.</p>
          <div class="grid grid--2">
            <label class="field"><span>Oma verkkotunnus</span><input name="custom_domain" value="${e(org.custom_domain || '')}" placeholder="varaus.yhdistys.fi"></label>
            <label class="field"><span>Kamo-näkyvyys</span><select name="white_label">
              <option value="0"${!org.white_label ? ' selected' : ''}>Näytä Kamo-alatunniste</option>
              <option value="1"${org.white_label ? ' selected' : ''}>Piilota Kamo (white label)</option>
            </select></label>
          </div>
          <p class="muted">Julkiseen instanssiluetteloon lisääminen on erillinen instanssin ylläpitäjän valinta.</p>
        </div>

        <div class="card card--spaced">
          <h2>Sähköposti</h2>
          <p class="muted">Oletuksena viestit lähtevät instanssin palvelimelta (lc-email). Voit antaa organisaatiolle oman SMTP-palvelimen; salasana salataan APP_SECRET-avaimella.</p>
          <div class="grid grid--2">
            <label class="field"><span>SMTP-palvelin</span><input name="smtp_host" value="${e(org.smtp_host || '')}" placeholder="smtp.yhdistys.fi"></label>
            <label class="field"><span>Portti</span><input name="smtp_port" type="number" min="1" max="65535" value="${Number(org.smtp_port || 587)}"></label>
            <label class="field"><span>Käyttäjätunnus</span><input name="smtp_user" value="${e(org.smtp_user || '')}" autocomplete="off"></label>
            <label class="field"><span>Salasana</span><input name="smtp_password" type="password" autocomplete="new-password" placeholder="${org.smtp_password_enc ? 'Jätä tyhjäksi, jos ei muutu' : 'Valinnainen'}"></label>
            <label class="field"><span>Lähettäjäosoite</span><input name="smtp_from" type="email" value="${e(org.smtp_from || '')}" placeholder="kalusto@yhdistys.fi"></label>
            <label class="field"><span>TLS</span><select name="smtp_secure"><option value="0"${!org.smtp_secure ? ' selected' : ''}>STARTTLS / portti 587</option><option value="1"${org.smtp_secure ? ' selected' : ''}>Suora TLS / portti 465</option></select></label>
          </div>
        </div>

        <div class="form-actions form-actions--end">
          <button class="btn btn--primary" type="submit">Tallenna asetukset</button>
        </div>
      </form>

      <form class="card card--spaced" method="post" action="/hallinta/asetukset/testi">
        ${csrfInput(res.locals.csrfToken)}
        <h2>Lähetä testiviesti</h2>
        <p class="muted">Testaa nykyiset SMTP-asetukset. Jos SMTP:tä ei ole määritetty, viesti kirjataan palvelimen lokiin.</p>
        <div class="form-actions">
          <label class="field field--grow"><span>Vastaanottaja</span><input name="test_email" type="email" value="${e(org.contact_email || '')}" placeholder="sinä@yhdistys.fi"></label>
          <button class="btn btn--quiet" type="submit">Lähetä testi</button>
        </div>
      </form>
    </div>
  </section>`;
  return adminPage(req, res, { title: 'Asetukset', tab: 'settings', body });
}

export function membersPage(req, res, data) {
  const { members } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>Jäsenet</h1>
      <p class="lead">Jäsenet voivat varata kalustoa. Ylläpitäjät voivat käsitellä varauksia ja muokata asetuksia.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="card">
        <div class="section__head section__head--small"><h2>Jäsenet</h2><span class="count">${members.length} kpl</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nimi</th><th>Sähköposti</th><th>Rooli</th><th>Liittynyt</th><th></th></tr></thead>
          <tbody>${members.map((member) => `<tr>
            <td>${e(member.name)}</td>
            <td>${e(member.email)}</td>
            <td>${member.role === 'owner' ? '<span class="badge badge--info">Omistaja</span>' : `<form method="post" action="/hallinta/jasenet/${e(member.user_id)}/rooli" class="inline-form">${csrfInput(res.locals.csrfToken)}<select name="role" aria-label="Rooli"><option value="member"${member.role === 'member' ? ' selected' : ''}>Jäsen</option><option value="admin"${member.role === 'admin' ? ' selected' : ''}>Ylläpitäjä</option></select><button class="linkish" type="submit">Tallenna</button></form>`}</td>
            <td>${fiDate(member.created_at)}</td>
            <td>${member.role !== 'owner' ? `<form method="post" action="/hallinta/jasenet/${e(member.user_id)}/poista" class="inline-form">${csrfInput(res.locals.csrfToken)}<button class="linkish linkish--danger" type="submit">Poista</button></form>` : ''}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
      <aside class="card">
        <h2>Lisää jäsen</h2>
        <p class="muted">Jäsenen pitää olla rekisteröitynyt palveluun samalla sähköpostilla.</p>
        <form method="post" action="/hallinta/jasenet">
          ${csrfInput(res.locals.csrfToken)}
          <label class="field"><span>Sähköposti</span><input name="email" type="email" required></label>
          <label class="field"><span>Rooli</span><select name="role"><option value="member">Jäsen</option><option value="admin">Ylläpitäjä</option></select></label>
          <button class="btn btn--primary btn--block" type="submit">Lisää jäsen</button>
        </form>
      </aside>
    </div>
  </section>`;
  return adminPage(req, res, { title: 'Jäsenet', tab: 'members', body });
}

export function apiPage(req, res, data) {
  const { keys, newKey } = data;
  const body = `
  <section class="page-head">
    <div class="container">
      <h1>API</h1>
      <p class="lead">Integraatiot voivat lukea kalustoa ja tehdä varauksia organisaation puolesta.</p>
      <div class="hero__actions"><a class="btn btn--quiet" href="/api/v1/openapi.json">Avaa OpenAPI 3.1</a></div>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      ${newKey ? `<div class="card card--highlight">
        <h2>Uusi API-avain</h2>
        <p>Kopioi avain nyt. Sitä ei näytetä enää uudelleen.</p>
        <code class="key-reveal">${e(newKey)}</code>
      </div>` : ''}
      <div class="split split--wide">
        <div class="card">
          <div class="section__head section__head--small"><h2>Avaimet</h2><span class="count">${keys.length} kpl</span></div>
          ${keys.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Nimi</th><th>Etuliite</th><th>Oikeudet</th><th>Viimeksi käytetty</th><th></th></tr></thead>
            <tbody>${keys.map((key) => `<tr>
              <td>${e(key.name)}</td>
              <td><code>${e(key.prefix)}…</code></td>
              <td>${e(key.scopes.join(', '))}</td>
              <td>${key.last_used_at ? fiDateTime(key.last_used_at) : 'Ei vielä'}</td>
              <td>${key.revoked_at ? '<span class="badge badge--muted">Peruutettu</span>' : `<form method="post" action="/hallinta/api/avaimet/${e(key.id)}/peruuta" class="inline-form">${csrfInput(res.locals.csrfToken)}<button class="linkish linkish--danger" type="submit">Peruuta</button></form>`}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : emptyState('Ei avaimia', 'Luo ensimmäinen avain lomakkeella.')}
        </div>
        <aside class="card">
          <h2>Luo avain</h2>
          <form method="post" action="/hallinta/api/avaimet">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Nimi</span><input name="name" placeholder="Esim. verkkosivun lomake" required></label>
            <label class="field"><span>Oikeudet</span><select name="scopes">
              <option value="read">Luku</option>
              <option value="read,write">Luku ja kirjoitus</option>
              <option value="read,write,admin">Luku, kirjoitus ja hallinta</option>
            </select></label>
            <button class="btn btn--primary btn--block" type="submit">Luo avain</button>
          </form>
        </aside>
      </div>
      <div class="card card--spaced">
        <h2>Kutsut</h2>
        <p class="muted">Kaikki kutsut vaativat <code>Authorization: Bearer &lt;avain&gt;</code> -otsakkeen.</p>
        <div class="table-wrap"><table class="table table--compact">
          <thead><tr><th>Metodi</th><th>Polku</th><th>Kuvaus</th></tr></thead>
          <tbody>
            <tr><td><code>GET</code></td><td><code>/api/v1/me</code></td><td>Organisaatio ja avaimen oikeudet</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/v1/warehouses</code></td><td>Varastot</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/v1/items</code></td><td>Nimikkeet ja saldot</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/v1/availability</code></td><td>Saatavuus aikavälille</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/v1/bookings</code></td><td>Varaukset</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/v1/bookings</code></td><td>Luo varaus</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/v1/bookings/{reference}</code></td><td>Yksi varaus</td></tr>
            <tr><td><code>PATCH</code></td><td><code>/api/v1/bookings/{reference}/status</code></td><td>Vaihda tila</td></tr>
          </tbody>
        </table></div>
      </div>
    </div>
  </section>`;
  return adminPage(req, res, { title: 'API', tab: 'api', body });
}
