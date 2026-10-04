import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL = "https://hd-market-api-production.up.railway.app/api/";
export const TOKEN_KEY = "hd-market-token-v2";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public extra: Record<string, any> = {},
  ) {
    super(code);
  }
}

export const getToken = () => AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
export const setToken = (t: string) => AsyncStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);

/** POST to the HD Market server. `auth` adds the saved login token. */
export async function api<T = any>(name: string, body: Record<string, any> = {}, auth = false): Promise<T> {
  const payload = { ...body };
  if (auth) payload.token = (await getToken()) ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("network");
  } finally {
    clearTimeout(timer);
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    throw new ApiError("server", res.status);
  }
  if (!res.ok || data.error) {
    const { error, ...extra } = data;
    throw new ApiError(String(error ?? "server"), res.status, extra);
  }
  return data as T;
}

export type Wallet = { id: number; name: string; icon: string | null; number: string };
export type AppConfig = {
  maintenance: { on: boolean; message: string };
  banner: { on: boolean; text: string };
  wallets: Wallet[];
  methods?: PayMethod[];
  rates?: Record<string, number>;
  update?: { version: string; url: string; notes: string; force: boolean };
};

export type PayMethod = { id: number; name: string; currency: string; icon: string | null; info: string; instructions: string; min_amount: number; max_amount: number; expiry_minutes: number };
export type HistoryItem = {
  kind: "deposit" | "txn"; txn_id: string; type: string; status: string; amount: number; currency: string; title: string;
  balance_before: number | null; balance_after: number | null; reject_reason: string | null; created_at: number;
};
export type Notif = { id: number; kind: string; title: string; body: string; title_en: string | null; body_en: string | null; ref: string | null; is_read: number; created_at: number };
