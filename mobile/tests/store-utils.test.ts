import { describe, expect, it } from "vitest";

import { formatStoreClock, isSupportedLocale } from "../lib/store-utils";

describe("store utilities", () => {
  it("accepts the four supported application languages", () => {
    expect(["ar", "en", "vi", "zh"].every(isSupportedLocale)).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });

  it("formats a midnight clock value with the required date and AM marker", () => {
    const value = formatStoreClock(new Date(2026, 8, 28, 0, 5, 9));
    expect(value).toEqual({ date: "28/09/2026", time: "12:05:09 AM" });
  });

  it("formats an afternoon clock value with a 12-hour PM marker", () => {
    const value = formatStoreClock(new Date(2026, 8, 28, 13, 59, 37));
    expect(value).toEqual({ date: "28/09/2026", time: "1:59:37 PM" });
  });
});
