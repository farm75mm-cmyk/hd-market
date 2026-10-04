import Constants from "expo-constants";

export const currentVersion = (): string => Constants.expoConfig?.version ?? "0.0.0";

/** true when `remote` is a higher dotted version than `local`. */
export function isNewer(remote: string, local: string): boolean {
  const a = remote.split(".").map((n) => parseInt(n, 10) || 0);
  const b = local.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
