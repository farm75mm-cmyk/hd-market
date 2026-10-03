export type SupportedLocale = "ar" | "en" | "vi" | "zh";

export function isSupportedLocale(value: string | undefined): value is SupportedLocale {
  return value === "ar" || value === "en" || value === "vi" || value === "zh";
}

export function formatStoreClock(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const period = hour24 >= 12 ? "PM" : "AM";

  return {
    date: `${day}/${month}/${year}`,
    time: `${hour12}:${minutes}:${seconds} ${period}`,
  };
}
