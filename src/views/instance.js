import { e, fiDate } from '../util.js';
import { THEMES } from '../themes.js';
import { orgUrl } from '../tenant.js';
import { renderPage } from './layout.js';
import { flash, emptyState, stat, csrfInput, themeSwatches } from './components.js';

export function instanceHome(req, res, data) {
  const { orgs, summary } = data;
  const { instance, user } = res.locals;
  const body = `${flash(req)}
  <section class="hero hero--instance">
    <div class="container hero__grid">
      <div class="hero__copy">
        <h1>Varauskalenteri, joka taipuu järjestön näköiseksi.</h1>
        <p class="lead">${e(instance.footer_note || 'Jokaisella järjestöllä oma alidomain, varastot, kalusto ja varauskäytäntö. Teema vaihtuu yhdellä valinnalla.')}</p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="#luo">Luo organisaatio</a>
          <a class="btn btn--quiet" href="/api/v1/openapi.json">Tutustu rajapintaan</a>
        </div>
        <p class="hero__meta">${Number(summary.orgCount)} organisaatiota · ${Number(summary.warehouseCount)} varastoa · ${Number(summary.itemCount)} nimikettä</p>
      </div>
      <aside class="hero__panel panel">
        <p class="panel__title">Mitä instanssi tarjoaa</p>
        <ul class="checklist">
          <li>Oma alidomain jokaiselle organisaatiolle</li>
          <li>Varastokohtaiset saldot ja nouto-ohjeet</li>
          <li>Joko välitön vahvistus tai hyväksyntä</li>
          <li>Teema organisaation brändin mukaan</li>
          <li>API ja webhook-valmius integraatioille</li>
        </ul>
        <p class="muted">${e(instance.name)} · ${e(THEMES[instance.theme]?.label || 'Yleinen')}</p>
      </aside>
    </div>
  </section>

  <section class="section" id="organisaatiot">
    <div class="container">
      <div class="section__head"><h2>Organisaatiot</h2><span class="count">${orgs.length} kpl</span></div>
      ${orgs.length ? `<div class="grid grid--3">${orgs.map((org) => `<a class="card org-card" href="${orgUrl(req, org, '/')}">
        <div class="org-card__top"><span class="brand__mark brand__mark--sm">${e(org.name.slice(0, 2).toUpperCase())}</span>${themeSwatches(org.theme)}</div>
        <h3>${e(org.name)}</h3>
        <p class="muted">${e(org.about || 'Äänentoistokaluston varauskalenteri.')}</p>
        <span class="org-card__stats">${Number(org.warehouse_count)} varastoa · ${Number(org.item_count)} nimikettä</span>
        <span class="arrow-link">Avaa kalenteri</span>
      </a>`).join('')}</div>` : emptyState('Ei organisaatioita vielä', 'Luo ensimmäinen organisaatio alla olevalla lomakkeella.')}
    </div>
  </section>

  <section class="section section--tint">
    <div class="container">
      <div class="section__head"><h2>Rakennettu arjen käyttöön</h2></div>
      <div class="grid grid--3">
        <article class="card feature-card"><h3>Varastot ja saldot</h3><p>Jokainen varasto pitää oman saldonsa. Varaus lukitsee määrän vain valituksi ajaksi.</p></article>
        <article class="card feature-card"><h3>Selkeä varauspolku</h3><p>Kirjautuminen, päivät, kalusto ja yhteystiedot. Ei erillistä lomaketta sähköpostissa.</p></article>
        <article class="card feature-card"><h3>Teema ja API</h3><p>Neljä valmista teemaa, omat fontit ja värit. Integraatiot käyttävät organisaation API-avainta.</p></article>
      </div>
    </div>
  </section>

  <section class="section" id="luo">
    <div class="container split">
      <div>
        <h2>Luo organisaatio</h2>
        <p class="lead">Saat oman alidomainin, ylläpitäjän roolin ja tyhjän kalenterin. Voit muuttaa teemaa ja varauskäytäntöä myöhemmin.</p>
        <p class="muted">Organisaation tunniste muodostetaan nimestä. Sen voi vaihtaa tietokannassa, mutta ei käyttöliittymässä.</p>
      </div>
      ${user ? `<div class="card">
        <form method="post" action="/organisaatiot">
          ${csrfInput(res.locals.csrfToken)}
          <label class="field"><span>Organisaation nimi</span><input name="name" required placeholder="Esim. Mielenosoitukset.fi"></label>
          <label class="field"><span>Teema</span><select name="theme">${Object.entries(THEMES).map(([key, theme]) => `<option value="${e(key)}"${key === 'general' ? ' selected' : ''}>${e(theme.label)}</option>`).join('')}</select></label>
          <label class="field"><span>Lyhyt esittely</span><textarea name="about" rows="3" placeholder="Mitä kalustoa ja kenelle?"></textarea></label>
          <button class="btn btn--primary btn--block" type="submit">Luo organisaatio</button>
        </form>
      </div>` : `<div class="card">
        <h2 class="card__title">Kirjaudu ensin</h2>
        <p>Organisaation luominen vaatii tunnuksen. Voit luoda tunnuksen samalla kertaa.</p>
        <div class="hero__actions"><a class="btn btn--primary" href="/kirjaudu?next=/#luo">Kirjaudu</a><a class="btn btn--quiet" href="/rekisteroidy?next=/#luo">Luo tunnus</a></div>
      </div>`}
    </div>
  </section>`;

  return renderPage(req, res, {
    title: 'Etusivu',      description: 'Itse ylläpidettävä varauskalenteri yhdistyksille.',
    body,
  });
}

export function instanceAdminPage(req, res, data) {
  const { orgs, summary } = data;
  const { instance } = res.locals;
  const body = `${flash(req)}
  <section class="page-head">
    <div class="container">
      <h1>Instanssi</h1>
      <p class="lead">Instanssin ulkoasu ja organisaatiot.</p>
    </div>
  </section>
  <section class="section section--tight">
    <div class="container">
      <div class="stat-grid">
        ${stat('Organisaatioita', summary.orgCount)}
        ${stat('Varastoja', summary.warehouseCount)}
        ${stat('Nimikkeitä', summary.itemCount)}
        ${stat('Aktiivisia varauksia', summary.activeBookings)}
      </div>
      <div class="split split--wide">
        <div class="card">
          <h2>Instanssin asetukset</h2>
          <form method="post" action="/instanssi">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Instanssin nimi</span><input name="name" value="${e(instance.name)}" required></label>
            <label class="field"><span>Oletusteema</span><select name="theme">${Object.entries(THEMES).map(([key, theme]) => `<option value="${e(key)}"${instance.theme === key ? ' selected' : ''}>${e(theme.label)}</option>`).join('')}</select></label>
            <label class="field"><span>Alatunnisteen teksti</span><textarea name="footer_note" rows="3">${e(instance.footer_note || '')}</textarea></label>
            <label class="field"><span>Salli uusien organisaatioiden luonti</span><select name="allow_org_signup"><option value="1"${instance.allow_org_signup ? ' selected' : ''}>Sallittu</option><option value="0"${!instance.allow_org_signup ? ' selected' : ''}>Estetty</option></select></label>
            <button class="btn btn--primary" type="submit">Tallenna asetukset</button>
          </form>
        </div>
        <div class="card">
          <h2>Luo organisaatio</h2>
          <form method="post" action="/instanssi/organisaatiot">
            ${csrfInput(res.locals.csrfToken)}
            <label class="field"><span>Nimi</span><input name="name" required></label>
            <label class="field"><span>Teema</span><select name="theme">${Object.entries(THEMES).map(([key, theme]) => `<option value="${e(key)}">${e(theme.label)}</option>`).join('')}</select></label>
            <button class="btn btn--quiet btn--block" type="submit">Luo organisaatio</button>
          </form>
        </div>
      </div>
      <div class="card card--spaced">
        <div class="section__head section__head--small"><h2>Organisaatiot</h2><span class="count">${orgs.length} kpl</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nimi</th><th>Tunniste</th><th>Verkkotunnus</th><th>Teema</th><th>Varastoja</th><th>Nimikkeitä</th><th>Näkyvyys</th><th>Tila</th><th></th></tr></thead>
          <tbody>${orgs.map((org) => `<tr>
            <td><a href="${orgUrl(req, org, '/')}">${e(org.name)}</a></td>
            <td><code>${e(org.slug)}</code></td>
            <td>${org.custom_domain ? `<code>${e(org.custom_domain)}</code>` : '<span class="muted">Alidomain</span>'}</td>
            <td>${e(THEMES[org.theme]?.label || org.theme)}</td>
            <td class="num">${Number(org.warehouse_count)}</td>
            <td class="num">${Number(org.item_count)}</td>
            <td>${org.listed_on_instance ? '<span class="badge badge--ok">Julkinen</span>' : '<span class="badge badge--muted">Piilotettu</span>'}</td>
            <td>${org.parked_at ? '<span class="badge badge--muted">Parkissa</span>' : '<span class="badge badge--ok">Käytössä</span>'}</td>
            <td class="row-actions">
              <form method="post" action="/instanssi/organisaatiot/${e(org.id)}/nakyvyys" class="inline-form">${csrfInput(res.locals.csrfToken)}<button class="linkish" type="submit">${org.listed_on_instance ? 'Piilota' : 'Julkaise'}</button></form>
              <form method="post" action="/instanssi/organisaatiot/${e(org.id)}/park" class="inline-form">${csrfInput(res.locals.csrfToken)}<button class="linkish" type="submit">${org.parked_at ? 'Ota käyttöön' : 'Parkkiin'}</button></form>
            </td>
          </tr>`).join('')}</tbody>
        </table></div>
        <p class="muted">Parkittu organisaatio ei vastaa alidomainissa. Tiedot säilyvät.</p>
      </div>
    </div>
  </section>`;
  return renderPage(req, res, {
    title: 'Instanssi',
    description: 'Kamo-instanssin hallinta.',
    body,
  });
}
