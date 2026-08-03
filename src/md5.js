// MD5 (RFC 1321) implementation.
// Web Crypto SubtleCrypto does not support MD5, so it is implemented here.
// Input can be a string (UTF-8 encoded internally) or a Uint8Array.
// Returns the lowercase hex digest (32 chars).

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = [];
for (let i = 0; i < 64; i++) {
  K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
}

export function md5(message) {
  const bytes = message instanceof Uint8Array ? message : new TextEncoder().encode(message);
  const n = bytes.length;

  // Padding: 0x80, then zeros, then 64-bit little-endian bit length
  const blockCount = Math.ceil((n + 9) / 64);
  const padded = new Uint8Array(blockCount * 64);
  padded.set(bytes);
  padded[n] = 0x80;
  const dv = new DataView(padded.buffer);
  const bitLenLo = (n * 8) >>> 0;
  const bitLenHi = Math.floor(n * 8 / 0x100000000);
  dv.setUint32(padded.length - 8, bitLenLo, true);
  dv.setUint32(padded.length - 4, bitLenHi, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const X = new Array(16);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      X[i] = dv.getUint32(off + i * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) & 15;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) & 15;
      }

      const tmp = D;
      D = C;
      C = B;
      const sum = (A + F + K[i] + X[g]) | 0;
      const rot = ((sum << SHIFTS[i]) | (sum >>> (32 - SHIFTS[i]))) | 0;
      B = (B + rot) | 0;
      A = tmp;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  let hex = '';
  for (const w of [a0, b0, c0, d0]) {
    const buf = new ArrayBuffer(4);
    const v = new DataView(buf);
    v.setUint32(0, w, true);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < 4; i++) {
      hex += arr[i].toString(16).padStart(2, '0');
    }
  }
  return hex;
}
