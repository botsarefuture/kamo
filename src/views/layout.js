import { e, initials } from '../util.js';

function navLink(href, label, current) {
  return `<a href="${href}"${current ? ' aria-current="page"' : ''}>${e(label)}</a>`;
}

export function renderPage(req, res, { title, description = '', body, bodyClass = '', adminTab = null }) {
  const { org, instance, theme, user, isAdmin } = res.locals;
  const currentPath = res.locals.path || req.path;
  const instanceName = instance?.name || 'Kamo';
  const pageTitle = org ? `${title} · ${org.name}` : `${title} · ${instanceName}`;
  const year = new Date().getFullYear();
  const orgName = org?.name || instanceName;

  const orgNav = org
    ? [
        navLink('/', 'Etusivu', currentPath === '/'),
        navLink('/kalusto', 'Kalusto', currentPath.startsWith('/kalusto')),
        navLink('/varastot', 'Varastot', currentPath.startsWith('/varastot')),
        navLink('/ohjeet', 'Ohjeet', currentPath.startsWith('/ohjeet')),
        isAdmin ? navLink('/hallinta', 'Hallinta', currentPath.startsWith('/hallinta')) : '',
      ].join('')
    : [
        navLink('/', 'Etusivu', currentPath === '/'),
        '<a href="/#organisaatiot">Organisaatiot</a>',
        '<a href="/api/v1/openapi.json">Rajapinta</a>',
      ].join('');

  const actions = org
    ? user
      ? `<a class="btn btn--quiet btn--sm" href="/omat-varaukset">Omat varaukset</a>
         <a class="btn btn--primary btn--sm" href="/varaa">Varaa kalusto</a>
         <form method="post" action="/ulos" class="inline-form">
           <input type="hidden" name="_csrf" value="${e(res.locals.csrfToken)}">
           <button class="linkish" type="submit">Kirjaudu ulos</button>
         </form>`
      : `<a class="btn btn--quiet btn--sm" href="/kirjaudu">Kirjaudu</a>
         <a class="btn btn--primary btn--sm" href="/varaa">Varaa kalusto</a>`
    : user
      ? `<a class="btn btn--quiet btn--sm" href="/instanssi">Instanssi</a>
         <form method="post" action="/ulos" class="inline-form">
           <input type="hidden" name="_csrf" value="${e(res.locals.csrfToken)}">
           <button class="linkish" type="submit">Kirjaudu ulos</button>
         </form>`
      : `<a class="btn btn--quiet btn--sm" href="/kirjaudu">Kirjaudu</a>
         <a class="btn btn--primary btn--sm" href="/#luo">Luo organisaatio</a>`;

  const adminbar = adminTab
    ? `<nav class="adminbar" aria-label="Hallinnan valikko">
        <div class="container adminbar__inner">
          <a href="/hallinta"${adminTab === 'dashboard' ? ' aria-current="page"' : ''}>Yleiskatsaus</a>
          <a href="/hallinta/varaukset"${adminTab === 'bookings' ? ' aria-current="page"' : ''}>Varaukset</a>
          <a href="/hallinta/kalusto"${adminTab === 'items' ? ' aria-current="page"' : ''}>Kalusto</a>
          <a href="/hallinta/varastot"${adminTab === 'warehouses' ? ' aria-current="page"' : ''}>Varastot</a>
          <a href="/hallinta/asetukset"${adminTab === 'settings' ? ' aria-current="page"' : ''}>Asetukset</a>
          <a href="/hallinta/jasenet"${adminTab === 'members' ? ' aria-current="page"' : ''}>Jäsenet</a>
          <a href="/hallinta/api"${adminTab === 'api' ? ' aria-current="page"' : ''}>API</a>
          <a class="adminbar__exit" href="/">Siirry sivustolle</a>
        </div>
      </nav>`
    : '';

  const footer = org
    ? `<footer class="footer">
        <div class="container footer__grid">
          <div class="footer__brand">
            <span class="brand__mark brand__mark--sm">${e(initials(orgName))}</span>
            <div>
              <p class="footer__name">${e(orgName)}</p>
              <p class="footer__note">${e(org.about || 'Äänentoistokaluston varauskalenteri.')}</p>
            </div>
          </div>
          <div>
            <h2 class="footer__title">Yhteystiedot</h2>
            <p>${e(org.contact_email || 'Ei ilmoitettua sähköpostia')}</p>
            ${org.contact_phone ? `<p>${e(org.contact_phone)}</p>` : ''}
          </div>
          <div>
            <h2 class="footer__title">Varaus</h2>
            <ul class="footer__links">
              <li><a href="/varaa">Varaa kalusto</a></li>
              <li><a href="/omat-varaukset">Omat varaukset</a></li>
              <li><a href="/ohjeet">Nouto ja palautus</a></li>
            </ul>
          </div>
          <div>
            <h2 class="footer__title">Ulkoasu</h2>
            <button class="btn btn--quiet btn--sm" type="button" data-mode-toggle>Vaihda tummaan</button>
          </div>
        </div>
        <div class="container footer__base">
          <span>© ${year} ${e(orgName)}</span>
          <span>${org.white_label ? 'Varauskalenteri' : 'Kamo · varauskalenteri'}</span>
        </div>
      </footer>`
    : `<footer class="footer">
        <div class="container footer__grid footer__grid--instance">
          <div class="footer__brand">
            <span class="brand__mark brand__mark--sm">K</span>
            <div>
              <p class="footer__name">${e(instanceName)}</p>
              <p class="footer__note">${e(instance?.footer_note || 'Itse ylläpidettävä varauskalenteri yhdistyksille.')}</p>
            </div>
          </div>
          <div>
            <h2 class="footer__title">Rajapinta</h2>
            <ul class="footer__links">
              <li><a href="/api/v1/openapi.json">OpenAPI 3.1</a></li>
              <li><a href="/api/v1/health">Tila</a></li>
            </ul>
          </div>
          <div>
            <h2 class="footer__title">Ulkoasu</h2>
            <button class="btn btn--quiet btn--sm" type="button" data-mode-toggle>Vaihda tummaan</button>
          </div>
        </div>
        <div class="container footer__base">
          <span>© ${year} ${e(instanceName)}</span>
          <span>Node.js · PostgreSQL</span>
        </div>
      </footer>`;

  return `<!doctype html>
<html lang="fi" data-theme="${e(theme || 'general')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${e(pageTitle)}</title>
  ${description ? `<meta name="description" content="${e(description)}">` : ''}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/fonts.css">
  <link rel="stylesheet" href="/styles.css">
  <script>
    (function () {
      try {
        var stored = localStorage.getItem('kamo-mode');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.mode = (stored === 'dark' || stored === 'light') ? stored : (prefersDark ? 'dark' : 'light');
      } catch (error) {
        document.documentElement.dataset.mode = 'light';
      }
    })();
  </script>
</head>
<body class="${e(bodyClass)}">
  <a class="skip" href="#main">Siirry sisältöön</a>
  <header class="topbar">
    <div class="container topbar__inner">
      <a class="brand" href="/">
        <span class="brand__mark">${e(initials(orgName))}</span>
        <span class="brand__text">
          <span class="brand__name">${e(orgName)}</span>
          <span class="brand__sub">${org ? 'Varauskalenteri' : 'Monen organisaation varauskalenteri'}</span>
        </span>
      </a>
      <nav class="nav" aria-label="Päävalikko">${orgNav}</nav>
      <div class="topbar__actions">${actions}</div>
    </div>
  </header>
  ${adminbar}
  <main id="main">${body}</main>
  ${footer}
  <script>
    (function () {
      var root = document.documentElement;
      document.querySelectorAll('[data-mode-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
          var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
          var current = root.dataset.mode || (prefersDark ? 'dark' : 'light');
          var next = current === 'dark' ? 'light' : 'dark';
          root.dataset.mode = next;
          try { localStorage.setItem('kamo-mode', next); } catch (error) {}
          button.textContent = next === 'dark' ? 'Vaihda vaaleaan' : 'Vaihda tummaan';
        });
      });
    })();
  </script>
</body>
</html>`;
}
