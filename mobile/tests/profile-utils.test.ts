import { describe, expect, it } from "vitest";

import {
  canChangeUsername,
  getUsernameChangeDaysRemaining,
  USERNAME_CHANGE_INTERVAL_DAYS,
} from "../lib/profile-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("15-day username change rule", () => {
  it("allows a first username change", () => {
    expect(canChangeUsername(null)).toBe(true);
    expect(getUsernameChangeDaysRemaining(undefined)).toBe(0);
  });

  it("blocks another change during the 15-day period", () => {
    const now = Date.UTC(2026, 8, 28);
    const changedFiveDaysAgo = now - 5 * DAY_MS;
    expect(canChangeUsername(changedFiveDaysAgo, now)).toBe(false);
    expect(getUsernameChangeDaysRemaining(changedFiveDaysAgo, now)).toBe(10);
  });

  it("allows another change after 15 days", () => {
    const now = Date.UTC(2026, 8, 28);
    const changedLongAgo = now - USERNAME_CHANGE_INTERVAL_DAYS * DAY_MS;
    expect(canChangeUsername(changedLongAgo, now)).toBe(true);
  });
});
