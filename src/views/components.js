import { e, statusLabel, statusTone, bookingModeLabel } from '../util.js';
import { THEMES } from '../themes.js';

const messages = {
  'varaus-lahetetty': ['Varaus vastaanotettu.', 'ok'],
  'varaus-peruttu': ['Varaus peruttu.', 'ok'],
  'kirjauduit': ['Kirjauduit sisään.', 'ok'],
  'rekisteroidyt': ['Tunnus luotu.', 'ok'],
  'uloskirjautunut': ['Kirjauduit ulos.', 'ok'],
  'salasana-vaihdettu': ['Salasana vaihdettu.', 'ok'],
  'tila-paivitetty': ['Varauksen tila päivitetty.', 'ok'],
  'kalusto-lisatty': ['Nimike lisätty.', 'ok'],
  'kalusto-paivitetty': ['Nimike tallennettu.', 'ok'],
  'kalusto-arkistoitu': ['Nimike arkistoitu.', 'ok'],
  'varasto-lisatty': ['Varasto lisätty.', 'ok'],
  'varasto-paivitetty': ['Varasto tallennettu.', 'ok'],
  'varasto-arkistoitu': ['Varasto arkistoitu.', 'ok'],
  'saldo-paivitetty': ['Saldot tallennettu.', 'ok'],
  'asetukset-tallennettu': ['Asetukset tallennettu.', 'ok'],
  'jasen-lisatty': ['Jäsen lisätty.', 'ok'],
  'jasen-paivitetty': ['Jäsenen rooli päivitetty.', 'ok'],
  'jasen-poistettu': ['Jäsen poistettu.', 'ok'],
  'avain-luotu': ['API-avain luotu. Kopioi avain nyt, sitä ei näytetä uudelleen.', 'ok'],
  'avain-peruutettu': ['API-avain peruutettu.', 'ok'],
  'org-luotu': ['Organisaatio luotu.', 'ok'],
  'instanssi-tallennettu': ['Instanssin asetukset tallennettu.', 'ok'],
  'julkinen-paivitetty': ['Näkyvyys päivitetty.', 'ok'],
  'email-lahetetty': ['Testiviesti lähetetty.', 'ok'],
  'email-loki': ['SMTP ei ole käytössä; viesti kirjattiin lokiin.', 'ok'],
  'email-virhe': ['Testiviestin lähetys epäonnistui. Tarkista SMTP-asetukset.', 'err'],
  'domain-varattu': ['Verkkotunnus on jo käytössä toisella organisaatiolla.', 'err'],
  'smtp-secret': ['APP_SECRET puuttuu, joten SMTP-salasanaa ei voitu tallentaa.', 'err'],
  'puuttuva': ['Täytä puuttuvat kentät.', 'err'],
  'kirjautuminen': ['Sähköposti tai salasana ei täsmää.', 'err'],
  'sahkoposti': ['Sähköposti on jo käytössä.', 'err'],
  'jasen-puuttuu': ['Sähköpostilla ei löytynyt tunnusta. Pyydä henkilöä rekisteröitymään ensin.', 'err'],
  'salasana': ['Salasana on liian lyhyt, vähintään 8 merkkiä.', 'err'],
  'slug': ['Tunniste on varattu tai puuttuva.', 'err'],
  'varaus': ['Varausta ei voitu tehdä. Tarkista päivät ja saldot.', 'err'],
  'tila': ['Tilan vaihto ei onnistunut.', 'err'],
  'oikeus': ['Sinulla ei ole oikeutta tähän toimintoon.', 'err'],
  'tuntematon': ['Jokin meni pieleen. Yritä uudelleen.', 'err'],
};

export function flash(req) {
  const ok = messages[req.query?.ok];
  const err = messages[req.query?.virhe];
  const item = err || ok;
  if (!item) return '';
  return `<div class="container"><div class="flash flash--${item[1]}" role="status">${e(item[0])}</div></div>`;
}

export function badge(status) {
  return `<span class="badge badge--${statusTone(status)}">${e(statusLabel(status))}</span>`;
}

export function modeBadge(mode) {
  return `<span class="badge badge--muted">${e(bookingModeLabel(mode))}</span>`;
}

export function emptyState(title, text) {
  return `<div class="empty"><p class="empty__title">${e(title)}</p><p class="empty__text">${e(text)}</p></div>`;
}

export function stat(label, value, note = '') {
  return `<div class="stat"><span class="stat__label">${e(label)}</span><strong class="stat__value">${e(value)}</strong>${note ? `<span class="stat__note">${e(note)}</span>` : ''}</div>`;
}

export function themeSwatches(key) {
  const theme = THEMES[key] || THEMES.general;
  return `<span class="swatches" aria-hidden="true">${theme.swatches
    .map((color) => `<span style="background:${e(color)}"></span>`)
    .join('')}</span>`;
}

export function csrfInput(token) {
  return `<input type="hidden" name="_csrf" value="${e(token)}">`;
}

export function dateInput(name, value, extra = '') {
  return `<input type="date" id="${e(name)}" name="${e(name)}" value="${e(value)}" ${extra}>`;
}
