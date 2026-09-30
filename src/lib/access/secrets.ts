import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 64, saltBytes: 16 } as const;
const SCRYPT_MAXMEM = 128 * SCRYPT.N * SCRYPT.r * 2;

const MINIMUM_KEY_BYTES = 32;

export const PASSWORD_LENGTH = { min: 8, max: 128 } as const;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await scrypt(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT_MAXMEM,
  });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parsePasswordHash(encoded: string): ParsedHash | null {
  const [scheme, n, r, p, salt, key] = encoded.split(":");
  if (scheme !== "scrypt" || !salt || !key) return null;
  const params = [n, r, p].map(Number);
  if (!params.every((value) => Number.isSafeInteger(value) && value > 0)) return null;
  const decodedKey = Buffer.from(key, "base64url");
  if (decodedKey.length < MINIMUM_KEY_BYTES) return null;
  return { N: params[0], r: params[1], p: params[2], salt: Buffer.from(salt, "base64url"), key: decodedKey };
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return false;
  const candidate = await scrypt(password, parsed.salt, parsed.key.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: 128 * parsed.N * parsed.r * 2,
  });
  return timingSafeEqual(candidate, parsed.key);
}

let decoyHash: Promise<string> | undefined;

export async function spendPasswordCheck(password: string): Promise<void> {
  decoyHash ??= hashPassword(generateToken());
  await verifyPassword(password, await decoyHash);
}
