import {
  e,
  addDaysIso,
  fiDate,
  fiDateRange,
  statusLabel,
  bookingModeLabel,
  truncate,
} from '../util.js';
import { renderPage } from './layout.js';
import { flash, badge, emptyState, csrfInput } from './components.js';

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.category_name || 'Muut';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()];
}

function warehouseCard(warehouse, canSee) {
  return `<article class="card warehouse-card">
    <div class="warehouse-card__top">
      <h3><a href="/varastot/${e(warehouse.id)}">${e(warehouse.name)}</a></h3>
      ${canSee ? `<span class="count">${Number(warehouse.item_count || 0)} nimikettä</span>` : ''}
    </div>
    ${canSee
      ? `<p class="muted">${e([warehouse.address, warehouse.city].filter(Boolean).join(', '))}</p>
         ${warehouse.pickup_instructions ? `<p class="clamp">${e(truncate(warehouse.pickup_instructions, 170))}</p>` : ''}`
      : '<p class="muted">Sijainti ja nouto-ohjeet näkyvät jäsenille.</p>'}
    <a class="arrow-link" href="/varastot/${e(warehouse.id)}">Varaston tiedot</a>
  </article>`;
}

export function homePage(req, res, data) {
  const { org, theme } = res.locals;
  const canSee = res.locals.canSeeWarehouseDetails;
  const { warehouses, categories, items, summary } = data;
  const nextStep =
    org.booking_mode === 'approval'
      ? 'Jokainen varaus tarkistetaan ennen noutoa.'
      : org.booking_mode === 'hybrid'
        ? 'Jäsenenä saat vahvistuksen heti; muut lähettävät varauspyynnön.'
        : 'Kirjautuneena saat varausvahvistuksen heti.';

  const body = `${flash(req)}
  <section class="hero">
    <div class="container hero__grid">
      <div class="hero__copy">
        <h1>Kalusto lainaan ilman arvailua.</h1>
        <p class="lead">${e(org.about || 'Kokoa varaus, tarkista saldo ja nouda varastolta. Kalusto pysyy kirjattuna koko lainan ajan.')}</p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="/varaa">${canSee ? 'Varaa kalusto' : org.booking_mode === 'login' ? 'Kirjaudu ja varaa' : 'Varaa tai hae käyttöoikeutta'}</a>
          <a class="btn btn--quiet" href="/kalusto">Katso koko kalusto</a>
        </div>
        <p class="hero__meta">${e(org.contact_email || '')}${org.contact_phone ? ` · ${e(org.contact_phone)}` : ''}</p>
      </div>
      <aside class="hero__panel panel">
        <p class="panel__title">Näin varaus etenee</p>
        <ol class="steps">
          <li><span>1</span><div><strong>Valitse varasto ja päivät</strong><p>Näet samalla, mitä on vapaana juuri silloin.</p></div></li>
          <li><span>2</span><div><strong>Poimi kalusto</strong><p>Jäsenenä näet vapaat määrät; muut lähettävät pyynnön.</p></div></li>
          <li><span>3</span><div><strong>Nouda ja palauta</strong><p>${e(nextStep)}</p></div></li>
        </ol>
        <div class="hero__facts">
          <span><strong>${Number(summary.warehouseCount)}</strong> varastoa</span>
          <span><strong>${Number(summary.itemCount)}</strong> nimikettä</span>
          <span><strong>${e(bookingModeLabel(org.booking_mode))}</strong> käytäntö</span>
        </div>
      </aside>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head">
        <h2>Varastot</h2>
        <a class="arrow-link" href="/varastot">Kaikki varastot</a>
      </div>
      ${warehouses.length ? `<div class="grid grid--3">${warehouses.map((w) => warehouseCard(w, canSee)).join('')}</div>` : emptyState('Ei varastoja vielä', 'Ylläpitäjä voi lisätä ensimmäisen varaston hallinnasta.')}
    </div>
  </section>

  <section class="section section--tint">
    <div class="container">
      <div class="section__head">
        <h2>Kalusto</h2>
        <a class="arrow-link" href="/kalusto">Selaa kalustoa</a>
      </div>
      <div class="chips">
        ${categories.map((category) => `<a class="chip" href="/kalusto?category=${encodeURIComponent(category.id)}">${e(category.name)} <span>${Number(category.count)}</span></a>`).join('')}
      </div>
      <div class="grid grid--3">
        ${items.map((item) => `<a class="card item-card" href="/kalusto?q=${encodeURIComponent(item.name)}">
          <span class="item-card__category">${e(item.category_name || 'Muut')}</span>
          <strong>${e(item.name)}</strong>
          <span class="muted">${e(truncate(item.description || '', 90))}</span>
          ${canSee ? `<span class="item-card__stock">${Number(item.totalStock)} ${e(item.unit)} yhteensä</span>` : ''}
        </a>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container split">
      <div>
        <h2>Nouto ja palautus</h2>
        <p class="lead">Varastoilla on omat nouto-ohjeet. Jäsenenä näet osoitteet ja ohjeet suoraan; muille ne lähetetään hyväksynnän yhteydessä.</p>
        <a class="btn btn--quiet" href="/ohjeet">Lue ohjeet</a>
      </div>
      <div class="card policy-card">
        <dl class="facts">
          <div><dt>Varaus tehdään</dt><dd>vähintään ${Number(org.min_notice_days)} päivää ennen noutoa</dd></div>
          <div><dt>Pisin varaus</dt><dd>${Number(org.max_booking_days)} päivää</dd></div>
          <div><dt>Hyväksyntä</dt><dd>${e(bookingModeLabel(org.booking_mode))}</dd></div>
          <div><dt>Yhteys</dt><dd>${e(org.contact_email || 'ei ilmoitettu')}</dd></div>
        </dl>
      </div>
    </div>
  </section>`;

  return renderPage(req, res, {
    title: 'Etusivu',
    description: org.about || 'Äänentoistokaluston varauskalenteri.',
    body,
    bodyClass: `theme-${theme}`,
  });
}

export function catalogPage(req, res, data) {
  const canSee = res.locals.canSeeWarehouseDetails;
  const { items, categories, warehouses, filters } = data;
  const selectedWarehouse = warehouses.find((w) => w.id === filters.warehouseId) || null;
  const groups = groupByCategory(items);

  const stockHead = canSee
    ? (selectedWarehouse
      ? `<th class="num">${e(selectedWarehouse.name)}</th><th class="num">Yhteensä</th>`
      : warehouses.map((w) => `<th class="num">${e(w.name)}</th>`).join('') + '<th class="num">Yhteensä</th>')
    : '';

  const rows = (groupItems) => groupItems.map((item) => {
    const stockCells = canSee
      ? (selectedWarehouse
        ? `<td class="num">${Number(item.stockByWarehouse[selectedWarehouse.id] || 0)}</td>`
        : warehouses.map((w) => `<td class="num">${Number(item.stockByWarehouse[w.id] || 0)}</td>`).join('')) +
        `<td class="num"><strong>${Number(item.totalStock)}</strong></td>`
      : '';
    return `<tr>
      <td><strong>${e(item.name)}</strong>${item.description ? `<span class="row-note">${e(truncate(item.description, 110))}</span>` : ''}</td>
      <td>${e(item.unit)}</td>
      ${stockCells}
    </tr>`;
  }).join('');

  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>Kalusto</h1>
      <p class="lead">Koko organisaation lainattava kalusto. ${canSee ? 'Varastokohtaiset saldot päivittyvät varausten mukana.' : 'Tarkat saldot ja noutopaikat näkyvät jäsenille.'}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      <form class="filterbar" method="get" action="/kalusto">
        <label class="field"><span>Hae nimikettä</span><input type="search" name="q" value="${e(filters.q)}" placeholder="Esim. mikrofoni"></label>
        <label class="field"><span>Kategoria</span><select name="category">
          <option value="">Kaikki</option>
          ${categories.map((c) => `<option value="${e(c.id)}"${filters.categoryId === c.id ? ' selected' : ''}>${e(c.name)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Varasto</span><select name="warehouse">
          <option value="">Kaikki varastot</option>
          ${warehouses.map((w) => `<option value="${e(w.id)}"${filters.warehouseId === w.id ? ' selected' : ''}>${e(w.name)}</option>`).join('')}
        </select></label>
        <button class="btn btn--primary" type="submit">Rajaa</button>
        ${filters.q || filters.categoryId || filters.warehouseId ? '<a class="linkish" href="/kalusto">Tyhjennä</a>' : ''}
      </form>

      ${groups.length ? groups.map(([category, groupItems]) => `
        <section class="catalog-group">
          <div class="section__head section__head--small"><h2>${e(category)}</h2><span class="count">${groupItems.length} nimikettä</span></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Nimike</th><th>Yksikkö</th>${stockHead}</tr></thead>
              <tbody>${rows(groupItems)}</tbody>
            </table>
          </div>
        </section>`).join('') : emptyState('Ei osumia', 'Kokeile toista hakua tai tyhjennä rajaukset.')}
    </div>
  </section>`;

  return renderPage(req, res, {
    title: 'Kalusto',
    description: 'Organisaation lainattava äänentoistokalusto ja varastosaldot.',
    body,
  });
}

export function warehousesPage(req, res, data) {
  const canSee = res.locals.canSeeWarehouseDetails;
  const { warehouses } = data;
  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>Varastot</h1>
      <p class="lead">Nouto- ja palautuspaikat. ${canSee ? 'Osoitteet ja ohjeet ovat jäsenille.' : 'Osoitteet ja tarkat ohjeet näkyvät jäsenille.'}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      ${warehouses.length ? `<div class="grid grid--2">${warehouses.map((w) => `<article class="card warehouse-card warehouse-card--wide">
        <div class="warehouse-card__top"><h2><a href="/varastot/${e(w.id)}">${e(w.name)}</a></h2>${canSee ? `<span class="count">${Number(w.item_count || 0)} nimikettä</span>` : ''}</div>
        ${canSee
          ? `<p class="muted">${e([w.address, w.postal_code, w.city].filter(Boolean).join(', '))}</p>
             ${w.opening_info ? `<p>${e(w.opening_info)}</p>` : ''}
             ${w.pickup_instructions ? `<div class="instruction"><span class="instruction__label">Nouto</span><p>${e(truncate(w.pickup_instructions, 220))}</p></div>` : ''}`
          : '<p class="muted">Sijainti, yhteystiedot ja nouto-ohjeet näkyvät jäsenille. Voit myös lähettää varauspyynnön.</p>'}
        <a class="arrow-link" href="/varastot/${e(w.id)}">Avaa varasto</a>
      </article>`).join('')}</div>` : emptyState('Ei varastoja', 'Ylläpitäjä voi lisätä varaston hallinnasta.')}
    </div>
  </section>`;
  return renderPage(req, res, {
    title: 'Varastot',
    description: 'Varastojen nouto-ohjeet ja kalusto.',
    body,
  });
}

export function warehousePage(req, res, data) {
  const canSee = res.locals.canSeeWarehouseDetails;
  const { warehouse, items } = data;
  const org = res.locals.org;
  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <a class="backlink" href="/varastot">Varastot</a>
      <h1>${e(warehouse.name)}</h1>
      <p class="lead">${canSee ? e([warehouse.address, warehouse.postal_code, warehouse.city].filter(Boolean).join(', ')) : 'Sijainti ja nouto-ohjeet näkyvät jäsenille.'}</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="/varaa?warehouse=${e(warehouse.id)}">${canSee ? 'Varaa tästä varastosta' : org.booking_mode === 'login' ? 'Kirjaudu ja varaa' : 'Lähetä varauspyyntö'}</a>
        ${canSee && warehouse.map_url ? `<a class="btn btn--quiet" href="${e(warehouse.map_url)}" rel="noreferrer">Avaa kartalla</a>` : ''}
      </div>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      ${canSee ? `<div class="split split--wide">
        <div>
          <h2>Nouto</h2>
          <div class="prose">${warehouse.pickup_instructions ? e(warehouse.pickup_instructions).replace(/\n/g, '<br>') : '<p>Nouto-ohjeita ei ole vielä lisätty.</p>'}</div>
          <h2>Palautus</h2>
          <div class="prose">${warehouse.return_instructions ? e(warehouse.return_instructions).replace(/\n/g, '<br>') : '<p>Palautusohjeita ei ole vielä lisätty.</p>'}</div>
          ${warehouse.opening_info ? `<h2>Aukiolo</h2><p>${e(warehouse.opening_info)}</p>` : ''}
          <h2>Yhteys</h2>
          <p>${e(warehouse.contact_name || '')}${warehouse.contact_phone ? ` · ${e(warehouse.contact_phone)}` : ''}${warehouse.contact_email ? ` · ${e(warehouse.contact_email)}` : ''}</p>
        </div>
        <aside class="card">
          <h2 class="card__title">Kalusto varastossa</h2>
          ${items.length ? `<ul class="stock-list">${items.map((item) => `<li><span>${e(item.name)}</span><strong>${Number(item.quantity)} ${e(item.unit)}</strong></li>`).join('')}</ul>` : '<p class="muted">Varastoon ei ole vielä merkitty saldoja.</p>'}
        </aside>
      </div>` : `<div class="card access-card">
        <h2>Nouto-osoite ja ohjeet</h2>
        <p>Varaston osoite, yhteystiedot, saldot ja nouto-ohjeet näkyvät organisaation jäsenille. Voit myös lähettää varauspyynnön, jolloin ylläpitäjä käsittelee sen ja lähettää nouto-ohjeet hyväksynnän yhteydessä.</p>
        <div class="hero__actions">
          ${req.user ? '' : '<a class="btn btn--quiet" href="/kirjaudu">Kirjaudu</a>'}
          <a class="btn btn--primary" href="/varaa?warehouse=${e(warehouse.id)}">${org.booking_mode === 'login' ? 'Kirjaudu ja varaa' : 'Lähetä varauspyyntö'}</a>
        </div>
      </div>`}
    </div>
  </section>`;
  return renderPage(req, res, {
    title: warehouse.name,
    description: `${warehouse.name}: nouto- ja palautusohjeet.`,
    body,
  });
}

export function bookingPage(req, res, data) {
  const {
    org, warehouses, warehouse, startsOn, endsOn, availability, items, values, error,
  } = data;
  const canSee = res.locals.canSeeWarehouseDetails;
  const isGuest = !canSee;
  const approval = org.booking_mode === 'approval';
  const submitLabel = isGuest
    ? 'Lähetä varauspyyntö'
    : approval
      ? 'Lähetä hyväksyttäväksi'
      : 'Vahvista varaus';
  const groups = groupByCategory(items.filter((item) => {
    const row = availability.get(item.id);
    return row && row.stock > 0;
  }));

  const itemRows = (groupItems) => groupItems.map((item) => {
    const row = availability.get(item.id);
    const available = row?.available ?? 0;
    const requested = Number(values[`qty_${item.id}`] || 0);
    const max = canSee ? available : 99;
    return `<tr>
      <td><label for="qty-${e(item.id)}"><strong>${e(item.name)}</strong></label>${item.description ? `<span class="row-note">${e(truncate(item.description, 90))}</span>` : ''}</td>
      <td>${e(item.unit)}</td>
      ${canSee ? `<td class="num">${available} / ${row?.stock ?? 0}</td>` : ''}
      <td class="num"><input class="qty" id="qty-${e(item.id)}" name="qty_${e(item.id)}" type="number" inputmode="numeric" min="0" max="${max}" value="${requested ? Math.min(requested, max) : 0}"${canSee && available === 0 ? ' disabled' : ''}></td>
    </tr>`;
  }).join('');

  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>${isGuest ? 'Hae käyttöä' : 'Varaa kalusto'}</h1>
      <p class="lead">${isGuest ? 'Valitse varasto ja aikaväli. Lähetä varauspyyntö, niin ylläpitäjä tarkistaa saatavuuden ja lähettää nouto-ohjeet hyväksynnän yhteydessä.' : 'Valitse varasto ja aikaväli. Saatavuus lasketaan kaikista samanaikaisista varauksista.'}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container booking-layout">
      <form class="booking-form" method="post" action="/varaa" data-booking-form>
        ${csrfInput(res.locals.csrfToken)}
        ${error ? `<div class="flash flash--err" role="alert">${e(error)}</div>` : ''}
        <section class="panel">
          <div class="panel__head"><span class="step-no">1</span><h2>Nouto ja palautus</h2></div>
          <div class="grid grid--3">
            <label class="field"><span>Varasto</span><select name="warehouse_id" required>
              ${warehouses.map((w) => `<option value="${e(w.id)}"${warehouse?.id === w.id ? ' selected' : ''}>${e(w.name)}</option>`).join('')}
            </select></label>
            <label class="field"><span>Noutopäivä</span><input type="date" name="starts_on" value="${e(startsOn)}" min="${e(addDaysIso(new Date().toISOString().slice(0, 10), Number(org.min_notice_days)))}" required></label>
            <label class="field"><span>Palautuspäivä</span><input type="date" name="ends_on" value="${e(endsOn)}" min="${e(startsOn)}" required></label>
          </div>
          <div class="form-actions">
            <button class="btn btn--quiet" type="submit" formmethod="get" formaction="/varaa">Päivitä saatavuus</button>
            <span class="muted">Voit muuttaa päiviä myös ennen lähetystä.</span>
          </div>
          ${canSee && warehouse ? `<p class="muted">${e([warehouse.address, warehouse.city].filter(Boolean).join(', '))}</p>` : '<p class="muted">Nouto-osoite näkyy jäsenille ja lähetetään hyväksynnän jälkeen.</p>'}
        </section>

        <section class="panel">
          <div class="panel__head"><span class="step-no">2</span><h2>Kalusto</h2></div>
          ${!canSee ? '<p class="muted">Tarkat vapaat määrät näkyvät jäsenille. Pyyntö tarkistetaan hyväksynnän yhteydessä.</p>' : ''}
          ${groups.length ? groups.map(([category, groupItems]) => `
            <div class="booking-group">
              <h3>${e(category)}</h3>
              <div class="table-wrap"><table class="table table--compact">
                <thead><tr><th>Nimike</th><th>Yksikkö</th>${canSee ? '<th class="num">Vapaana / saldo</th>' : ''}<th class="num">Määrä</th></tr></thead>
                <tbody>${itemRows(groupItems)}</tbody>
              </table></div>
            </div>`).join('') : emptyState('Ei vapaata kalustoa', 'Tälle varastolle ei ole merkitty saldoja. Kokeile toista varastoa.')}
        </section>

        <section class="panel">
          <div class="panel__head"><span class="step-no">3</span><h2>Yhteystiedot</h2></div>
          <div class="grid grid--2">
            <label class="field"><span>Nimi</span><input name="contact_name" value="${e(values.contact_name || '')}" autocomplete="name" required></label>
            <label class="field"><span>Sähköposti</span><input name="contact_email" type="email" value="${e(values.contact_email || '')}" autocomplete="email" required></label>
            <label class="field"><span>Puhelin</span><input name="contact_phone" value="${e(values.contact_phone || '')}" autocomplete="tel"></label>
            <label class="field"><span>Käyttötarkoitus</span><input name="purpose" value="${e(values.purpose || '')}" placeholder="Esim. mielenosoitus, harjoitus"></label>
          </div>
          <p class="muted">${isGuest
            ? 'Lähetä varauspyyntö. Saat nouto-osoitteen ja -ohjeet sähköpostitse, kun ylläpitäjä on hyväksynyt sen.'
            : approval
              ? 'Varaus jää odottamaan ylläpitäjän hyväksyntää. Näet tilan Omat varaukset -sivulta.'
              : 'Varaus vahvistetaan heti. Näet tilan Omat varaukset -sivulta.'}</p>
        </section>

        <div class="form-actions form-actions--end">
          <a class="btn btn--quiet" href="/kalusto">Takaisin kalustoon</a>
          <button class="btn btn--primary" type="submit">${submitLabel}</button>
        </div>
      </form>

      <aside class="booking-side">
        <div class="card">
          <h2 class="card__title">Varauksen tiedot</h2>
          <dl class="facts facts--stack">
            <div><dt>Varasto</dt><dd>${e(warehouse?.name || 'Valitse varasto')}</dd></div>
            <div><dt>Aikaväli</dt><dd>${fiDateRange(startsOn, endsOn)}</dd></div>
            <div><dt>Pisin varaus</dt><dd>${Number(org.max_booking_days)} päivää</dd></div>
            <div><dt>Ennakkoon</dt><dd>${Number(org.min_notice_days)} päivää</dd></div>
          </dl>
        </div>
        <div class="card">
          <h2 class="card__title">Muista</h2>
          <ul class="checklist">
            <li>Varaa vain se, mitä käytät.</li>
            <li>Nouda ja palauta varaston ohjeiden mukaan.</li>
            <li>Peruutus onnistuu Omat varaukset -sivulta.</li>
          </ul>
          <a class="arrow-link" href="/ohjeet">Nouto-ohjeet</a>
        </div>
      </aside>
    </div>
  </section>`;

  return renderPage(req, res, {
    title: isGuest ? 'Hae käyttöä' : 'Varaa kalusto',
    description: 'Varaa äänentoistokalusto valitulle aikavälille.',
    body,
  });
}

export function myBookingsPage(req, res, data) {
  const { bookings } = data;
  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>Omat varaukset</h1>
      <p class="lead">Kaikki varauksesi tässä organisaatiossa.</p>
      <div class="hero__actions"><a class="btn btn--primary" href="/varaa">Tee uusi varaus</a></div>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      ${bookings.length ? `<div class="stack">${bookings.map((booking) => `<article class="card booking-card">
        <div class="booking-card__top">
          <div><span class="ref">${e(booking.reference)}</span><h2>${e(booking.warehouse_name)}</h2></div>
          ${badge(booking.status)}
        </div>
        <dl class="facts">
          <div><dt>Aikaväli</dt><dd>${fiDateRange(booking.starts_on, booking.ends_on)}</dd></div>
          <div><dt>Yksiköitä</dt><dd>${Number(booking.units)}</dd></div>
          <div><dt>Luotu</dt><dd>${fiDate(booking.created_at)}</dd></div>
        </dl>
        ${booking.admin_note ? `<p class="note">${e(booking.admin_note)}</p>` : ''}
        ${['pending', 'approved'].includes(booking.status) ? `<form method="post" action="/omat-varaukset/${e(booking.id)}/peruuta" class="form-actions">
          ${csrfInput(res.locals.csrfToken)}
          <button class="btn btn--danger btn--sm" type="submit">Peruuta varaus</button>
        </form>` : ''}
      </article>`).join('')}</div>` : emptyState('Ei varauksia vielä', 'Tee ensimmäinen varaus kalustosivulta.')}
    </div>
  </section>`;
  return renderPage(req, res, {
    title: 'Omat varaukset',
    description: 'Omat kalustovaraukset.',
    body,
  });
}

export function bookingRequestPage(req, res, data) {
  const { booking } = data;
  const approved = booking.status === 'approved';
  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>${approved ? 'Varaus vahvistettu' : 'Varauspyyntö vastaanotettu'}</h1>
      <p class="lead">${approved ? 'Nouto-ohjeet lähetetään antamaasi sähköpostiin.' : 'Ylläpitäjä tarkistaa pyynnön ja lähettää nouto-ohjeet sähköpostiin.'}</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      <div class="card">
        <div class="booking-card__top"><div><span class="ref">${e(booking.reference)}</span><h2>${e(booking.warehouse_name)}</h2></div>${badge(booking.status)}</div>
        <dl class="facts">
          <div><dt>Aikaväli</dt><dd>${fiDateRange(booking.starts_on, booking.ends_on)}</dd></div>
          <div><dt>Yhteys</dt><dd>${e(booking.contact_email)}</dd></div>
          <div><dt>Tila</dt><dd>${e(statusLabel(booking.status))}</dd></div>
        </dl>
        <p class="muted">Säilytä varausnumero. Kysymyksissä ota yhteyttä ${e(res.locals.org.contact_email || 'organisaation ylläpitäjään')}.</p>
        <a class="btn btn--quiet" href="/">Etusivulle</a>
      </div>
    </div>
  </section>`;
  return renderPage(req, res, { title: 'Varauspyyntö', body });
}

export function instructionsPage(req, res, data) {
  const canSee = res.locals.canSeeWarehouseDetails;
  const { org, warehouses } = data;
  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>Nouto ja palautus</h1>
      <p class="lead">Lue varaston ohjeet ennen noutoa. Jäsenenä näet osoitteet ja varastokohtaiset ohjeet.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container split split--wide">
      <div class="prose">
        <h2>Ennen noutoa</h2>
        <p>Tarkista varausvahvistuksesta päivät ja varasto. Ota mukaan nimi, jolla varaus on tehty, ja saavu paikalle varaston aukioloaikoina.</p>
        <h2>Noudon yhteydessä</h2>
        <p>Käy kalusto läpi yhdessä ylläpitäjän kanssa. Merkitse puuttuvat tai rikkoutuneet osat heti, jotta vastuu ei siirry seuraavalle lainaajalle.</p>
        <h2>Palautus</h2>
        <p>Palauta kalusto sovittuna päivänä, puhtaana ja samaan paikkaan. Jos palautus viivästyy, ilmoita siitä ylläpitäjälle ajoissa.</p>
        <h2>Muutokset ja peruutukset</h2>
        <p>Voit peruuttaa hyväksytyn tai odottavan varauksen Omat varaukset -sivulta. Jos varaus on jo noudettu, ota yhteyttä ${e(org.contact_email || 'ylläpitäjään')}.</p>
        <div class="callout">
          <strong>Varauskäytäntö</strong>
          <p>Varaus tehdään vähintään ${Number(org.min_notice_days)} päivää ennen noutoa ja se voi kestää enintään ${Number(org.max_booking_days)} päivää. ${e(bookingModeLabel(org.booking_mode))}.</p>
        </div>
      </div>
      <div class="stack">
        ${canSee
          ? (warehouses.map((w) => `<article class="card">
              <h2 class="card__title">${e(w.name)}</h2>
              <p class="muted">${e([w.address, w.postal_code, w.city].filter(Boolean).join(', '))}</p>
              <h3>Nouto</h3>
              <p>${w.pickup_instructions ? e(w.pickup_instructions).replace(/\n/g, '<br>') : 'Ei erillisiä ohjeita.'}</p>
              <h3>Palautus</h3>
              <p>${w.return_instructions ? e(w.return_instructions).replace(/\n/g, '<br>') : 'Ei erillisiä ohjeita.'}</p>
            </article>`).join('') || emptyState('Ei varastoja', 'Ohjeita ei ole vielä lisätty.'))
          : `<article class="card access-card">
              <h2>Varastokohtaiset ohjeet</h2>
              <p>Osoitteet, yhteystiedot ja nouto-ohjeet näkyvät jäsenille. Voit lähettää varauspyynnön, jolloin saat ohjeet hyväksynnän jälkeen.</p>
              <div class="hero__actions">
                ${req.user ? '' : '<a class="btn btn--quiet" href="/kirjaudu">Kirjaudu</a>'}
                <a class="btn btn--primary" href="/varaa">${org.booking_mode === 'login' ? 'Kirjaudu ja varaa' : 'Lähetä varauspyyntö'}</a>
              </div>
            </article>`}
      </div>
    </div>
  </section>`;
  return renderPage(req, res, {
    title: 'Nouto ja palautus',
    description: 'Varastojen nouto- ja palautusohjeet.',
    body,
  });
}

export function authPage(req, res, { mode, next = '/', error = '', values = {} }) {
  const isRegister = mode === 'register';
  const body = `${flash(req)}
  <section class="auth-section">
    <div class="container auth-shell">
      <div class="card auth-card">
        <h1>${isRegister ? 'Luo tunnus' : 'Kirjaudu'}</h1>
        <p class="muted">${isRegister ? 'Tunnus liitetään tähän organisaatioon.' : 'Kirjaudu varataksesi kalustoa.'}</p>
        ${error ? `<div class="flash flash--err" role="alert">${e(error)}</div>` : ''}
        <form method="post" action="${isRegister ? '/rekisteroidy' : '/kirjaudu'}">
          ${csrfInput(res.locals.csrfToken)}
          <input type="hidden" name="next" value="${e(next)}">
          ${isRegister ? `<label class="field"><span>Nimi</span><input name="name" value="${e(values.name || '')}" autocomplete="name" required></label>` : ''}
          <label class="field"><span>Sähköposti</span><input name="email" type="email" value="${e(values.email || '')}" autocomplete="email" required></label>
          <label class="field"><span>Salasana</span><input name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8" required></label>
          <button class="btn btn--primary btn--block" type="submit">${isRegister ? 'Luo tunnus' : 'Kirjaudu'}</button>
        </form>
        <p class="auth-switch">${isRegister ? `Onko sinulla jo tunnus? <a href="/kirjaudu?next=${encodeURIComponent(next)}">Kirjaudu</a>` : `Eikö sinulla ole tunnusta? <a href="/rekisteroidy?next=${encodeURIComponent(next)}">Luo tunnus</a>`}</p>
      </div>
    </div>
  </section>`;
  return renderPage(req, res, {
    title: isRegister ? 'Luo tunnus' : 'Kirjaudu',
    description: 'Kirjautuminen Kamo-varauskalenteriin.',
    body,
  });
}

export function passwordPage(req, res, { error = '' } = {}) {
  const body = `${flash(req)}
  <section class="auth-section">
    <div class="container auth-shell">
      <div class="card auth-card">
        <h1>Vaihda salasana</h1>
        ${error ? `<div class="flash flash--err" role="alert">${e(error)}</div>` : ''}
        <form method="post" action="/salasana">
          ${csrfInput(res.locals.csrfToken)}
          <label class="field"><span>Nykyinen salasana</span><input name="current" type="password" autocomplete="current-password" required></label>
          <label class="field"><span>Uusi salasana</span><input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
          <button class="btn btn--primary btn--block" type="submit">Tallenna salasana</button>
        </form>
      </div>
    </div>
  </section>`;
  return renderPage(req, res, {
    title: 'Vaihda salasana',
    description: 'Vaihda Kamo-tunnuksen salasana.',
    body,
  });
}

export function notFoundPage(req, res, { slug = '' } = {}) {
  const body = `<section class="auth-section">
    <div class="container auth-shell">
      <div class="card auth-card">
        <p class="error-code">404</p>
        <h1>Sivua ei löytynyt</h1>
        <p class="muted">${slug ? `Organisaatiota ${e(slug)} ei ole olemassa tai se on poistettu käytöstä.` : 'Etsimääsi sivua ei ole olemassa.'}</p>
        <a class="btn btn--primary" href="/">Etusivulle</a>
      </div>
    </div>
  </section>`;
  return renderPage(req, res, { title: 'Sivua ei löytynyt', body });
}

export function errorPage(req, res) {
  const body = `<section class="auth-section">
    <div class="container auth-shell">
      <div class="card auth-card">
        <p class="error-code">Virhe</p>
        <h1>Jokin meni pieleen</h1>
        <p class="muted">Yritä hetken päästä uudelleen. Jos virhe jatkuu, ota yhteyttä ylläpitäjään.</p>
        <a class="btn btn--primary" href="/">Etusivulle</a>
      </div>
    </div>
  </section>`;
  return renderPage(req, res, { title: 'Virhe', body });
}
