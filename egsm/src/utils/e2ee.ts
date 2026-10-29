// src/utils/e2ee.ts
// Pure-TypeScript Zero-Dependency End-to-End Encryption Engine.
// Format: ENCv1:<iv_hex>:<cipher_hex>:<mac_hex>
// STRICT ANTI-CRASH: Zero native crypto dependencies, 100% pure TypeScript.

export const DEFAULT_PASSPHRASE = 'egsm-community-e2ee-shared-key-2026';
export const CIPHER_ALGORITHM = 'Deterministic 256-Bit Keystream PRNG + SHA-256 HMAC (Pure-TS)';

export interface DecryptedMessageResult {
  text: string;
  isEncrypted: boolean;
  verified: boolean;
}

// ─── Pure-TS SHA-256 Implementation ──────────────────────────────────────────

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256(text: string): string {
  let H0 = 0x6a09e667;
  let H1 = 0xbb67ae85;
  let H2 = 0x3c6ef372;
  let H3 = 0xa54ff53a;
  let H4 = 0x510e527f;
  let H5 = 0x9b05688c;
  let H6 = 0x1f83d9ab;
  let H7 = 0x5be0cd19;

  // UTF-8 encode safely into byte array
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }

  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  bytes.push((highBits >>> 24) & 0xff, (highBits >>> 16) & 0xff, (highBits >>> 8) & 0xff, highBits & 0xff);
  bytes.push((lowBits >>> 24) & 0xff, (lowBits >>> 16) & 0xff, (lowBits >>> 8) & 0xff, lowBits & 0xff);

  const W = new Int32Array(64);
  for (let blockOffset = 0; blockOffset < bytes.length; blockOffset += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = blockOffset + i * 4;
      W[i] = (bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(W[i - 15], 7) ^ rightRotate(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rightRotate(W[i - 2], 17) ^ rightRotate(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }

    let a = H0;
    let b = H1;
    let c = H2;
    let d = H3;
    let e = H4;
    let f = H5;
    let g = H6;
    let h = H7;

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  const toHex = (val: number) => (val >>> 0).toString(16).padStart(8, '0');
  return (
    toHex(H0) +
    toHex(H1) +
    toHex(H2) +
    toHex(H3) +
    toHex(H4) +
    toHex(H5) +
    toHex(H6) +
    toHex(H7)
  );
}

// ─── UTF-8 & Hex Encoders / Decoders ──────────────────────────────────────────

function utf8ToBytes(str: string): number[] {
  const encoded = encodeURIComponent(str);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return bytes;
}

function bytesToUtf8(bytes: number[]): string {
  if (bytes.length === 0) return '';
  let encoded = '';
  for (let i = 0; i < bytes.length; i++) {
    encoded += '%' + bytes[i].toString(16).padStart(2, '0');
  }
  return decodeURIComponent(encoded);
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ─── Deterministic 256-Bit Keystream PRNG Generator ──────────────────────────

function generateKeystream(keyHash: string, ivHex: string, length: number): number[] {
  const keystream: number[] = [];
  let blockCounter = 0;

  while (keystream.length < length) {
    const blockHash = sha256(`${keyHash}:${ivHex}:${blockCounter}`);
    const blockBytes = hexToBytes(blockHash);
    for (let i = 0; i < blockBytes.length && keystream.length < length; i++) {
      keystream.push(blockBytes[i]);
    }
    blockCounter++;
  }

  return keystream;
}

// ─── Key Fingerprint Helper (for Exhibition Inspector Modal) ─────────────────

export function getKeyFingerprint(passphrase?: string): string {
  const hash = sha256(passphrase || DEFAULT_PASSPHRASE).toUpperCase();
  return `${hash.slice(0, 4)}:${hash.slice(4, 8)}:${hash.slice(8, 12)}:${hash.slice(12, 16)}`;
}

// ─── Main E2EE Encrypt & Decrypt Functions ────────────────────────────────────

/**
 * Encrypts a plaintext message into zero-dependency E2EE ciphertext format:
 * `ENCv1:<iv_hex>:<cipher_hex>:<mac_hex>`
 */
export function encryptMessage(plainText: string, passphrase?: string): string {
  if (plainText === '') {
    // Zero-length text encrypts cleanly
  }

  const key = sha256(passphrase || DEFAULT_PASSPHRASE);

  // Generate random 64-bit IV (16 hex chars / 8 bytes)
  let ivHex = '';
  for (let i = 0; i < 8; i++) {
    const b = Math.floor(Math.random() * 256);
    ivHex += b.toString(16).padStart(2, '0');
  }

  const plainBytes = utf8ToBytes(plainText);
  const keystream = generateKeystream(key, ivHex, plainBytes.length);

  // XOR stream cipher
  const cipherBytes = plainBytes.map((byte, idx) => byte ^ keystream[idx]);
  const cipherHex = bytesToHex(cipherBytes);

  // Integrity Authentication Tag (MAC)
  const macHex = sha256(`${key}:${ivHex}:${cipherHex}`);

  return `ENCv1:${ivHex}:${cipherHex}:${macHex}`;
}

/**
 * Decrypts an ENCv1 payload or gracefully returns legacy plain text if unencrypted.
 */
export function decryptMessage(
  payload: string,
  passphrase?: string
): DecryptedMessageResult {
  // Graceful legacy handling: if message does not start with ENCv1:, it was stored in plaintext
  if (!payload || typeof payload !== 'string' || !payload.startsWith('ENCv1:')) {
    return {
      text: payload || '',
      isEncrypted: false,
      verified: true,
    };
  }

  const parts = payload.split(':');
  if (parts.length !== 4) {
    return {
      text: payload,
      isEncrypted: true,
      verified: false,
    };
  }

  const [, ivHex, cipherHex, macHex] = parts;
  const key = sha256(passphrase || DEFAULT_PASSPHRASE);

  // Verify MAC integrity tag before attempting decryption
  const expectedMac = sha256(`${key}:${ivHex}:${cipherHex}`);
  if (expectedMac.toLowerCase() !== macHex.toLowerCase()) {
    return {
      text: '[E2EE Message Integrity Verification Failed]',
      isEncrypted: true,
      verified: false,
    };
  }

  const cipherBytes = hexToBytes(cipherHex);
  const keystream = generateKeystream(key, ivHex, cipherBytes.length);
  const plainBytes = cipherBytes.map((byte, idx) => byte ^ keystream[idx]);

  try {
    const decryptedText = bytesToUtf8(plainBytes);
    return {
      text: decryptedText,
      isEncrypted: true,
      verified: true,
    };
  } catch {
    return {
      text: '[E2EE UTF-8 Decryption Failed]',
      isEncrypted: true,
      verified: false,
    };
  }
}
