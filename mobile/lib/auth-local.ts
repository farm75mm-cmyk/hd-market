/**
 * Local account store (interim, until the PHP/MySQL server is connected).
 * Passwords are never stored in plain text: salted + iterated SHA-256.
 * NOTE: real security requires server-side verification; swap the
 * functions below for API calls when the server is ready.
 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type Account = {
  username: string;
  email: string;
  salt: string;
  hash: string;
  failed: number;
  lockedUntil: number;
  /** Registration time (ms since epoch). */
  createdAt?: number;
};

export type AuthError = "noAccount" | "wrongPassword" | "locked" | "emailTaken" | "usernameTaken";
export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: AuthError; retryAfterSec?: number };

export const ACCOUNTS_KEY = "hd-market-accounts-v1";
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 5 * 60 * 1000;
const ITERATIONS = 3000;

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function utf8(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export function sha256Hex(message: string): string {
  const bytes = utf8(message);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) | 0;
    }
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15];
      const b = w[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export function hashPassword(password: string, salt: string): string {
  let digest = sha256Hex(`${salt}:${password}`);
  for (let i = 0; i < ITERATIONS; i++) digest = sha256Hex(`${digest}${salt}`);
  return digest;
}

function makeSalt(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const normalizeEmail = (v: string) => v.trim().toLowerCase();
export const normalizeUsername = (v: string) => v.trim().toLowerCase();

async function load(store: KeyValueStore): Promise<Account[]> {
  try {
    const raw = await store.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const save = (store: KeyValueStore, accounts: Account[]) =>
  store.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));

export async function registerAccount(
  store: KeyValueStore,
  input: { username: string; email: string; password: string },
): Promise<AuthResult> {
  const accounts = await load(store);
  const email = normalizeEmail(input.email);
  const uname = normalizeUsername(input.username);
  if (accounts.some((a) => a.email === email)) return { ok: false, error: "emailTaken" };
  if (accounts.some((a) => normalizeUsername(a.username) === uname)) {
    return { ok: false, error: "usernameTaken" };
  }
  const salt = makeSalt();
  const account: Account = {
    username: input.username.trim(),
    email,
    salt,
    hash: hashPassword(input.password, salt),
    failed: 0,
    lockedUntil: 0,
    createdAt: Date.now(),
  };
  await save(store, [...accounts, account]);
  return { ok: true, account };
}

export async function loginAccount(
  store: KeyValueStore,
  identifier: string,
  password: string,
  now = Date.now(),
): Promise<AuthResult> {
  const accounts = await load(store);
  const id = identifier.trim().toLowerCase();
  const index = accounts.findIndex((a) => a.email === id || normalizeUsername(a.username) === id);
  if (index < 0) return { ok: false, error: "noAccount" };
  const account = accounts[index];

  if (account.lockedUntil > now) {
    return { ok: false, error: "locked", retryAfterSec: Math.ceil((account.lockedUntil - now) / 1000) };
  }
  if (safeEqual(hashPassword(password, account.salt), account.hash)) {
    accounts[index] = { ...account, failed: 0, lockedUntil: 0 };
    await save(store, accounts);
    return { ok: true, account: accounts[index] };
  }
  const failed = account.failed + 1;
  const locked = failed >= MAX_FAILED_ATTEMPTS;
  accounts[index] = { ...account, failed: locked ? 0 : failed, lockedUntil: locked ? now + LOCK_MS : 0 };
  await save(store, accounts);
  return locked
    ? { ok: false, error: "locked", retryAfterSec: Math.ceil(LOCK_MS / 1000) }
    : { ok: false, error: "wrongPassword" };
}

export const SESSION_KEY = "hd-market-session-v1";

/** Remembers the signed-in account so the app can log in automatically next time. */
export async function saveSession(store: KeyValueStore, email: string): Promise<void> {
  await store.setItem(SESSION_KEY, normalizeEmail(email));
}

/** Returns the remembered account if it still exists, otherwise null. */
export async function getSession(store: KeyValueStore): Promise<Account | null> {
  try {
    const email = await store.getItem(SESSION_KEY);
    if (!email) return null;
    const accounts = await load(store);
    return accounts.find((a) => a.email === email) ?? null;
  } catch {
    return null;
  }
}

export async function clearSession(store: KeyValueStore & { removeItem?: (k: string) => Promise<void> }) {
  if (store.removeItem) await store.removeItem(SESSION_KEY);
  else await store.setItem(SESSION_KEY, "");
}

/** Changes the username of an account. Fails if another account already uses it. */
export async function renameAccount(
  store: KeyValueStore,
  email: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: "usernameTaken" | "noAccount" }> {
  const accounts = await load(store);
  const mail = normalizeEmail(email);
  const index = accounts.findIndex((a) => a.email === mail);
  if (index < 0) return { ok: false, error: "noAccount" };
  const uname = normalizeUsername(username);
  if (accounts.some((a, i) => i !== index && normalizeUsername(a.username) === uname)) {
    return { ok: false, error: "usernameTaken" };
  }
  accounts[index] = { ...accounts[index], username: username.trim() };
  await save(store, accounts);
  return { ok: true };
}
