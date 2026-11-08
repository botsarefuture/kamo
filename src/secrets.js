import crypto from 'node:crypto';
import { config } from './config.js';

function key() {
  return crypto.createHash('sha256').update(config.appSecret).digest();
}

export function canEncryptSecrets() {
  return config.appSecret.length >= 24;
}

export function encryptSecret(value) {
  if (!canEncryptSecrets()) {
    throw new Error('APP_SECRET puuttuu tai on liian lyhyt.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value) {
  if (!value) return '';
  if (!canEncryptSecrets()) throw new Error('APP_SECRET puuttuu.');
  const [ivPart, tagPart, dataPart] = String(value).split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Salatun arvon muoto on virheellinen.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
