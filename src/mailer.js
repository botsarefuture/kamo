import nodemailer from 'nodemailer';
import { one, query } from './db.js';
import { decryptSecret } from './secrets.js';
import { fiDateRange, statusLabel } from './util.js';

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function platformConfig() {
  if (process.env.MAIL_TRANSPORT === 'log' || !process.env.SMTP_HOST) return null;
  const user = process.env.SMTP_USER || '';
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (truthy(process.env.SMTP_SECURE) ? 465 : 587)),
    secure: truthy(process.env.SMTP_SECURE),
    auth: user ? { user, pass: process.env.SMTP_PASS || '' } : undefined,
  };
}

function transportConfig(org) {
  if (process.env.MAIL_TRANSPORT === 'log') return null;
  if (org.smtp_host) {
    let password = '';
    if (org.smtp_password_enc) {
      password = decryptSecret(org.smtp_password_enc);
    }
    return {
      host: org.smtp_host,
      port: Number(org.smtp_port || 587),
      secure: Boolean(org.smtp_secure),
      auth: org.smtp_user ? { user: org.smtp_user, pass: password } : undefined,
    };
  }
  return platformConfig();
}

function fromAddress(org) {
  return org.smtp_from || process.env.SMTP_FROM || org.contact_email || 'no-reply@localhost';
}

function addressLine(warehouse) {
  return [warehouse.address, warehouse.postal_code, warehouse.city].filter(Boolean).join(', ');
}

async function recordEmail({ orgId, bookingId, to, subject, status, error = null }) {
  try {
    await query(
      `INSERT INTO email_log (org_id, booking_id, to_email, subject, status, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, bookingId || null, to, subject, status, error],
    );
  } catch (err) {
    console.error('Could not write email_log:', err.message);
  }
}

async function deliver({ org, bookingId = null, to, subject, text }) {
  if (!to) return { status: 'skipped' };
  let config;
  try {
    config = transportConfig(org);
  } catch (err) {
    await recordEmail({
      orgId: org.id, bookingId, to, subject, status: 'failed', error: err.message,
    });
    console.error(`Email to ${to} failed: ${err.message}`);
    return { status: 'failed' };
  }
  if (!config) {
    console.log(`[mail:log] ${org.name} -> ${to}: ${subject}`);
    await recordEmail({ orgId: org.id, bookingId, to, subject, status: 'skipped' });
    return { status: 'skipped' };
  }
  try {
    const transport = nodemailer.createTransport(config);
    await transport.sendMail({ from: fromAddress(org), to, subject, text });
    await recordEmail({ orgId: org.id, bookingId, to, subject, status: 'sent' });
    return { status: 'sent' };
  } catch (err) {
    await recordEmail({
      orgId: org.id, bookingId, to, subject, status: 'failed', error: err.message,
    });
    console.error(`Email to ${to} failed: ${err.message}`);
    return { status: 'failed' };
  }
}

function itemLines(booking) {
  return (booking.items || [])
    .map((item) => `- ${item.name}: ${item.quantity} ${item.unit || 'kpl'}`)
    .join('\n');
}

export async function sendBookingEmail({ org, booking, kind = 'created' }) {
  const warehouse = await one(
    `SELECT name, address, postal_code, city, opening_info, pickup_instructions
     FROM warehouses WHERE id = $1`,
    [booking.warehouse_id],
  ).catch(() => null);
  const approved = booking.status === 'approved';
  const subjectBase = {
    created: approved ? `Varaus vahvistettu ${booking.reference}` : `Varausvastaanotto ${booking.reference}`,
    approved: `Varaus hyväksytty ${booking.reference}`,
    rejected: `Varaus hylätty ${booking.reference}`,
    cancelled: `Varaus peruttu ${booking.reference}`,
    returned: `Varaus palautettu ${booking.reference}`,
  }[kind] || `Varaus ${booking.reference}`;

  const lines = [
    `Hei ${booking.contact_name},`,
    '',
    subjectBase.charAt(0).toUpperCase() + subjectBase.slice(1) + '.',
    '',
    `Varasto: ${booking.warehouse_name || warehouse?.name || ''}`,
    `Aikaväli: ${fiDateRange(booking.starts_on, booking.ends_on)}`,
    `Tila: ${statusLabel(booking.status)}`,
    '',
    'Kalusto:',
    itemLines(booking) || '- Ei rivejä',
  ];
  if (approved && warehouse) {
    lines.push(
      '',
      'Nouto:',
      addressLine(warehouse),
      warehouse.opening_info ? `Aukiolo: ${warehouse.opening_info}` : '',
      warehouse.pickup_instructions || '',
    );
  } else {
    lines.push(
      '',
      'Nouto-osoite ja -ohjeet lähetetään, kun varaus on hyväksytty.',
    );
  }
  if (booking.admin_note) {
    lines.push('', `Ylläpitäjän viesti: ${booking.admin_note}`);
  }
  lines.push('', `Yhteydenotot: ${org.contact_email || 'organisaation ylläpitäjä'}`);
  if (!org.white_label) lines.push('', 'Lähetetty Kamo-varauskalenterista.');

  const customerText = lines.filter((line) => line !== '').join('\n');
  const results = [];
  results.push(await deliver({
    org,
    bookingId: booking.id,
    to: booking.contact_email,
    subject: subjectBase,
    text: customerText,
  }));

  if (kind === 'created' && org.contact_email && org.contact_email !== booking.contact_email) {
    const adminText = [
      `Uusi varaus ${booking.reference}.`,
      '',
      `Asiakas: ${booking.contact_name} <${booking.contact_email}>`,
      booking.contact_phone ? `Puhelin: ${booking.contact_phone}` : '',
      `Varasto: ${booking.warehouse_name || warehouse?.name || ''}`,
      `Aikaväli: ${fiDateRange(booking.starts_on, booking.ends_on)}`,
      booking.purpose ? `Käyttötarkoitus: ${booking.purpose}` : '',
      '',
      itemLines(booking),
      '',
      'Käsittele varaus hallinnassa.',
    ].filter(Boolean).join('\n');
    results.push(await deliver({
      org,
      bookingId: booking.id,
      to: org.contact_email,
      subject: `Uusi varaus ${booking.reference}`,
      text: adminText,
    }));
  }
  return results;
}

export function queueBookingEmail(args) {
  setImmediate(() => {
    sendBookingEmail(args).catch((err) => {
      console.error('Booking email failed:', err.message);
    });
  });
}

export async function sendTestEmail(org, to) {
  return deliver({
    org,
    to,
    subject: `Testiviesti: ${org.name}`,
    text: [
      `Tämä on testiviesti organisaatiolle ${org.name}.`,
      '',
      'Jos näet tämän, SMTP-asetukset toimivat.',
      org.white_label ? '' : 'Kamo-varauskalenteri',
    ].filter(Boolean).join('\n'),
  });
}
