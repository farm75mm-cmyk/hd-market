export type AxeItem = { id: number; level: number };

/** Price per piece in USDT. */
export const AXE_PRICE_USDT = 0.00025;

export const AXE_ITEMS: AxeItem[] = [
  { id: 0, level: 1 },
  { id: 1, level: 1 },
  { id: 2, level: 1 },
  { id: 3, level: 1 },
  { id: 4, level: 1 },
];

export const AXE_NAMES: Record<"ar" | "en" | "vi" | "zh", string[]> = {
  ar: ["فأس", "مجرفة", "منشار", "تي إن تي", "ديناميت"],
  en: ["Axe", "Shovel", "Saw", "TNT", "Dynamite"],
  vi: ["Rìu", "Xẻng", "Cưa", "TNT", "Thuốc nổ"],
  zh: ["斧头", "铲子", "锯子", "TNT炸药", "炸药"],
};
