export const USERNAME_CHANGE_INTERVAL_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getUsernameChangeDaysRemaining(
  lastChangedAt: number | null | undefined,
  now = Date.now(),
) {
  if (!lastChangedAt) return 0;
  const elapsed = Math.max(0, now - lastChangedAt);
  const remaining = USERNAME_CHANGE_INTERVAL_DAYS * DAY_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / DAY_MS) : 0;
}

export function canChangeUsername(lastChangedAt: number | null | undefined, now = Date.now()) {
  return getUsernameChangeDaysRemaining(lastChangedAt, now) === 0;
}
