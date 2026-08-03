// CookieCloud decryption using Web Crypto API.
// Supports both crypto types from the original server:
//   - legacy:          CryptoJS / OpenSSL password-based format
//                      ("Salted__" + 8-byte salt + ciphertext, AES-256-CBC)
//   - aes-128-cbc-fixed: raw ciphertext, AES-128-CBC, fixed 16-byte zero IV
// Key for both: first 16 chars of MD5(uuid + "-" + password)

import { md5 } from './md5.js';

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Key = MD5(uuid + "-" + password).substring(0, 16), as UTF-8 bytes
export function buildKey(uuid, password) {
  const hash = md5(uuid + '-' + password);
  return new TextEncoder().encode(hash.substring(0, 16));
}

// OpenSSL EVP_BytesToKey (MD5), deriving 32-byte key + 16-byte IV from password + salt
function evpBytesToKey(password, salt) {
  const total = 48;
  const derived = new Uint8Array(total);
  let prev = new Uint8Array(0);
  let offset = 0;
  while (offset < total) {
    const data = new Uint8Array(prev.length + password.length + salt.length);
    data.set(prev);
    data.set(password, prev.length);
    data.set(salt, prev.length + password.length);
    prev = hexToBytes(md5(data));
    derived.set(prev, offset);
    offset += prev.length;
  }
  return {
    key: derived.slice(0, 32),
    iv: derived.slice(32, 48),
  };
}

export async function decryptData(uuid, encrypted, password, cryptoType = 'legacy') {
  const keyBytes = buildKey(uuid, password);

  if (cryptoType === 'aes-128-cbc-fixed') {
    const iv = new Uint8Array(16);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, base64ToBytes(encrypted));
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  // legacy CryptoJS / OpenSSL format
  const raw = base64ToBytes(encrypted);
  if (raw.length < 16) throw new Error('Invalid ciphertext: too short');
  const magic = String.fromCharCode(...raw.slice(0, 8));
  if (magic !== 'Salted__') throw new Error('Invalid ciphertext: missing Salted__ magic');
  const salt = raw.slice(8, 16);
  const ciphertext = raw.slice(16);
  const { key, iv } = evpBytesToKey(keyBytes, salt);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
