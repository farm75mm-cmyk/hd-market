/**
 * Real accounts stored on the HD Market server (visible in the admin panel).
 * Same function names as the old on-device store so screens barely change.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, ApiError, clearToken, getToken, setToken } from "@/lib/api";

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type Account = {
  username: string;
  email: string;
  createdAt?: number;
  avatar?: string | null;
  balance: number;
};
export type AuthError =
  | "noAccount"
  | "wrongPassword"
  | "locked"
  | "emailTaken"
  | "usernameTaken"
  | "banned"
  | "network"
  | "maintenance"
  | "invalid";
export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: AuthError; retryAfterSec?: number };

const CACHE_KEY = "hd-market-account-cache-v2";
const toAccount = (d: any): Account => ({
  username: d.username,
  email: d.email,
  createdAt: (d.created ?? 0) * 1000,
  avatar: d.avatar ?? null,
  balance: Number(d.balance ?? 0),
});
const cache = (a: Account) => AsyncStorage.setItem(CACHE_KEY, JSON.stringify(a)).catch(() => undefined);

function mapError(e: unknown): AuthResult {
  if (!(e instanceof ApiError)) return { ok: false, error: "network" };
  switch (e.code) {
    case "no_account": return { ok: false, error: "noAccount" };
    case "wrong_password": return { ok: false, error: "wrongPassword" };
    case "locked": return { ok: false, error: "locked", retryAfterSec: Math.round(Number(e.extra.minutes ?? 5) * 60) };
    case "email_taken": return { ok: false, error: "emailTaken" };
    case "username_taken": return { ok: false, error: "usernameTaken" };
    case "banned": return { ok: false, error: "banned" };
    case "maintenance": return { ok: false, error: "maintenance" };
    case "network": case "server": return { ok: false, error: "network" };
    default: return { ok: false, error: "invalid" };
  }
}

export async function registerAccount(
  _store: KeyValueStore,
  input: { username: string; email: string; password: string },
): Promise<AuthResult> {
  try {
    await api("register", { username: input.username.trim(), email: input.email.trim(), password: input.password });
    return { ok: true, account: { username: input.username.trim(), email: input.email.trim().toLowerCase(), balance: 0 } };
  } catch (e) {
    return mapError(e);
  }
}

export async function loginAccount(_store: KeyValueStore, identifier: string, password: string): Promise<AuthResult> {
  try {
    const d = await api("login", { username: identifier.trim(), password });
    await setToken(d.token);
    const account = toAccount(d);
    await cache(account);
    return { ok: true, account };
  } catch (e) {
    return mapError(e);
  }
}

export async function saveSession(_store: KeyValueStore, _email: string): Promise<void> {
  /* the login token is already saved by loginAccount */
}

/** Returns the signed-in account (refreshed from the server), or null if signed out / banned. */
export async function getSession(_store?: KeyValueStore): Promise<Account | null> {
  if (!(await getToken())) return null;
  try {
    const account = toAccount(await api("me", {}, true));
    await cache(account);
    return account;
  } catch (e) {
    if (e instanceof ApiError && (e.code === "unauthorized" || e.code === "banned")) {
      await clearToken();
      await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
      return null;
    }
    // offline / maintenance: use the last known account
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as Account) : null;
    } catch {
      return null;
    }
  }
}

export async function clearSession(_store?: unknown): Promise<void> {
  try {
    await api("logout", {}, true);
  } catch {
    /* ignore */
  }
  await clearToken();
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
}

export async function renameAccount(
  _store: KeyValueStore,
  _email: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: "usernameTaken" | "tooSoon" | "network" | "noAccount"; days?: number }> {
  try {
    const d = await api("profile", { username: username.trim() }, true);
    await cache(toAccount(d));
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === "username_taken") return { ok: false, error: "usernameTaken" };
      if (e.code === "too_soon") return { ok: false, error: "tooSoon", days: Number(e.extra.days ?? 15) };
      if (e.code === "unauthorized") return { ok: false, error: "noAccount" };
    }
    return { ok: false, error: "network" };
  }
}

/** Uploads the profile picture so the admin panel can show it. Errors are ignored (picture stays on the phone). */
export async function syncAvatar(dataUri: string | null): Promise<void> {
  if (dataUri !== null && !/^data:image\/(jpeg|png|webp);base64,/.test(dataUri)) return;
  try {
    await api("profile", { avatar: dataUri }, true);
  } catch {
    /* ignore */
  }
}
