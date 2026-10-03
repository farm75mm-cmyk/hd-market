import { describe, expect, it } from "vitest";

import { FOOD_ITEMS, FOOD_PRICE_USDT } from "../lib/food-data";
import { filterFoodItems, formatUsdt, parseReadyList, summarizeSelection } from "../lib/food-utils";

describe("food data", () => {
  it("contains all 332 items with unique names in the original order", () => {
    expect(FOOD_ITEMS).toHaveLength(332);
    expect(new Set(FOOD_ITEMS.map((item) => item.name)).size).toBe(332);
    expect(FOOD_ITEMS[0].name).toBe("Lamb Doner Wrap");
    expect(FOOD_ITEMS[331].name).toBe("Colorful Candle");
    expect(FOOD_ITEMS.every((item, index) => item.id === index)).toBe(true);
  });
});

describe("food utilities", () => {
  it("formats USDT amounts", () => {
    expect(formatUsdt(0)).toBe("0.00");
    expect(formatUsdt(FOOD_PRICE_USDT)).toBe("0.001625");
    expect(formatUsdt(1.5)).toBe("1.50");
  });

  it("sums the selection", () => {
    expect(summarizeSelection(FOOD_ITEMS, { 0: 2, 3: 1 }, FOOD_PRICE_USDT)).toEqual({ count: 3, total: 0.004875 });
    expect(summarizeSelection(FOOD_ITEMS, {}, FOOD_PRICE_USDT)).toEqual({ count: 0, total: 0 });
  });

  it("filters by name or building", () => {
    expect(filterFoodItems(FOOD_ITEMS, "tea").length).toBeGreaterThan(5);
    expect(filterFoodItems(FOOD_ITEMS, "doner kebab").map((item) => item.name)).toContain("Lamb Doner Wrap");
    expect(filterFoodItems(FOOD_ITEMS, "   ")).toHaveLength(332);
  });

  it("parses a ready list with quantities and reports unknown lines", () => {
    const { quantities, missing } = parseReadyList("Lamb Doner Wrap x3\nGreen Tea 2\nlamb doner wrap\nNot A Food", FOOD_ITEMS);
    expect(quantities[0]).toBe(4);
    const greenTea = FOOD_ITEMS.find((item) => item.name === "Green Tea")!;
    expect(quantities[greenTea.id]).toBe(2);
    expect(missing).toEqual(["Not A Food"]);
  });
});

import { AXE_ITEMS, AXE_NAMES } from "../lib/axe-data";
describe("axe data", () => {
  it("has 5 items and a name for each in every language", () => {
    expect(AXE_ITEMS).toHaveLength(5);
    for (const names of Object.values(AXE_NAMES)) expect(names).toHaveLength(5);
  });
});
