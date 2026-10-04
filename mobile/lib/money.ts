import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { formatStoreClock } from "@/lib/store-utils";

export type Cur = "JOD" | "IQD" | "USDT";
export const CURS: Cur[] = ["JOD", "IQD", "USDT"];
export const CUR_META: Record<Cur, { flag: string; ar: string; en: string; dec: number }> = {
  JOD: { flag: "🇯🇴", ar: "دينار أردني JOD", en: "Jordanian Dinar JOD", dec: 3 },
  IQD: { flag: "🇮🇶", ar: "IQ MasterCard", en: "IQ MasterCard", dec: 0 },
  USDT: { flag: "₮", ar: "USDT", en: "USDT", dec: 2 },
};
export const isCur = (v: any): v is Cur => v === "JOD" || v === "IQD" || v === "USDT";

export function fmtMoney(n: number, cur: string): string {
  const dec = CUR_META[cur as Cur]?.dec ?? 2;
  const fixed = Number(n || 0).toFixed(dec);
  const [i, d] = fixed.split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${d ? "." + d : ""}`;
}

/** Product prices are stored in JOD; convert with the admin's rates (units per 1 USDT), rounded up. */
export function fromJod(jod: number, cur: Cur, rates: Record<string, number>): number {
  if (cur === "JOD" || !rates.JOD || !rates[cur]) return jod;
  const f = 10 ** CUR_META[cur].dec;
  return Math.ceil(((jod / rates.JOD) * rates[cur]) * f - 1e-6) / f;
}

const KEY = "hd-market-currency";
const listeners = new Set<(c: Cur) => void>();
let current: Cur = "JOD";
let loaded = false;

export function useCurrency(): [Cur, (c: Cur) => void] {
  const [c, setC] = useState<Cur>(current);
  useEffect(() => {
    listeners.add(setC);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY).then((v) => { if (isCur(v)) { current = v; listeners.forEach((l) => l(v)); } }).catch(() => undefined);
    } else setC(current);
    return () => { listeners.delete(setC); };
  }, []);
  const set = useCallback((n: Cur) => {
    current = n;
    listeners.forEach((l) => l(n));
    AsyncStorage.setItem(KEY, n).catch(() => undefined);
  }, []);
  return [c, set];
}

/** Local date (dd/mm/yyyy) and time (hh:mm:ss AM/PM) of a unix timestamp in seconds, in the user's timezone. */
export function stamp(ts: number) {
  return formatStoreClock(new Date(ts * 1000));
}

export const ACTIVE_DEPOSIT = ["awaiting_payment", "proof_sent", "under_review", "verifying", "amount_mismatch", "approved"];
export const STATUS_COLOR: Record<string, string> = {
  awaiting_payment: "#FFF3CD", proof_sent: "#DCEBFF", under_review: "#DCEBFF", verifying: "#DCEBFF", approved: "#E6F4E6", credited: "#E6F4E6",
  rejected: "#FDE8E8", cancelled: "#EEEEEE", expired: "#EEEEEE", amount_mismatch: "#FFE3C2", reversed: "#FDE8E8", done: "#E6F4E6",
};

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return formatStoreClock(now);
}
