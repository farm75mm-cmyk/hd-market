import type { FoodItem } from "./food-data";

export type FoodQuantities = Record<number, number>;

/** Formats a USDT amount: up to 6 decimals, never fewer than 2 (0.001625 -> "0.001625", 0 -> "0.00"). */
export function formatUsdt(value: number): string {
  const trimmed = value.toFixed(6).replace(/0+$/, "");
  const decimals = trimmed.split(".")[1] ?? "";
  return decimals.length < 2 ? value.toFixed(2) : trimmed;
}

/** Counts the selected pieces and the total price of the selection. */
export function summarizeSelection(items: FoodItem[], quantities: FoodQuantities, unitPrice: number) {
  let count = 0;
  for (const item of items) count += quantities[item.id] ?? 0;
  return { count, total: Math.round(count * unitPrice * 1e6) / 1e6 };
}

/** Case-insensitive search by item name or building name. */
export function filterFoodItems(items: FoodItem[], term: string): FoodItem[] {
  const query = term.trim().toLowerCase();
  if (!query) return items;
  return items.filter(
    (item) => item.name.toLowerCase().includes(query) || item.building.toLowerCase().includes(query),
  );
}

/**
 * Parses a pasted "ready list": one product per line, optional quantity as "x3", "×3", "*3" or " 3".
 * Matching is by exact name first, then by name prefix, then by substring.
 */
export function parseReadyList(text: string, items: FoodItem[]) {
  const quantities: FoodQuantities = {};
  const missing: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.*?)(?:\s*[x×*]\s*(\d+)|\s+(\d+))?\s*$/i);
    const name = (match?.[1] ?? line).trim().toLowerCase();
    const amount = Number(match?.[2] ?? match?.[3] ?? 1);
    const found =
      items.find((item) => item.name.toLowerCase() === name) ??
      items.find((item) => item.name.toLowerCase().startsWith(name)) ??
      (name ? items.find((item) => item.name.toLowerCase().includes(name)) : undefined);

    if (!found || !name) {
      missing.push(line);
      continue;
    }
    quantities[found.id] = (quantities[found.id] ?? 0) + (amount > 0 ? amount : 1);
  }

  return { quantities, missing };
}
