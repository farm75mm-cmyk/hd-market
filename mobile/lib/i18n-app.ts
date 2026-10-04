import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export type L = "ar" | "en" | "vi" | "zh";
export const useLocale = (param?: string): L => {
  const [l, setL] = useState<L>(param === "en" || param === "vi" || param === "zh" || param === "ar" ? param : "ar");
  useEffect(() => {
    if (param) return;
    AsyncStorage.getItem("hd-market-locale")
      .then((v) => (v === "ar" || v === "en" || v === "vi" || v === "zh") && setL(v))
      .catch(() => undefined);
  }, [param]);
  return l;
};

type Dict = Record<string, string>;
const AR: Dict = {
  wallet: "المحفظة", balance: "الرصيد", topup: "شحن الرصيد", amount: "المبلغ", chooseWallet: "اختر محفظة الدفع", payNumber: "رقم الدفع",
  copy: "نسخ", copied: "تم النسخ", receipt: "صورة إيصال الدفع", pickReceipt: "اختيار صورة الإيصال", send: "إرسال الطلب",
  sent: "تم إرسال طلب الشحن. سيتم مراجعته قريبًا.", pending: "قيد المراجعة", approved: "تمت الموافقة", rejected: "مرفوض",
  history: "طلبات الشحن", orders: "طلباتي", noOrders: "لا توجد طلبات بعد.", noTopups: "لا توجد طلبات شحن.",
  support: "الدعم", typeMsg: "اكتب رسالتك...", noMsgs: "ابدأ المحادثة مع الدعم.",
  qty: "العدد", price: "السعر", buy: "شراء", soldOut: "نفد", confirmBuy: "تأكيد الشراء؟", total: "الإجمالي",
  bought: "تم تقديم الطلب بنجاح.", noProducts: "لا توجد منتجات في هذا القسم.", back: "رجوع",
  new: "جديد", processing: "قيد التنفيذ", done: "مكتمل", cancelled: "ملغي",
  err: "حدث خطأ", net: "تعذّر الاتصال بالخادم.", insufficient: "رصيدك غير كافٍ. اشحن رصيدك أولًا.", outOfStock: "الكمية غير متوفرة.", pack: "العدد", limit: "الحد المسموح", limitExceeded: "تجاوزت الحد المسموح للطلب الواحد.",
  invalid: "تحقق من البيانات المدخلة.", tooMany: "طلبات كثيرة. حاول لاحقًا.", maint: "التطبيق تحت الصيانة حاليًا.",
  needAmount: "أدخل المبلغ واختر المحفظة وصورة الإيصال.", maintTitle: "تحت الصيانة", retry: "إعادة المحاولة",
};
const EN: Dict = {
  wallet: "Wallet", balance: "Balance", topup: "Top up balance", amount: "Amount", chooseWallet: "Choose a payment wallet", payNumber: "Payment number",
  copy: "Copy", copied: "Copied", receipt: "Payment receipt", pickReceipt: "Choose receipt image", send: "Submit request",
  sent: "Top-up request sent. It will be reviewed shortly.", pending: "Pending", approved: "Approved", rejected: "Rejected",
  history: "Top-up requests", orders: "My orders", noOrders: "No orders yet.", noTopups: "No top-up requests.",
  support: "Support", typeMsg: "Type your message...", noMsgs: "Start a conversation with support.",
  qty: "Quantity", price: "Price", buy: "Buy", soldOut: "Sold out", confirmBuy: "Confirm purchase?", total: "Total",
  bought: "Order placed successfully.", noProducts: "No products in this section.", back: "Back",
  new: "New", processing: "Processing", done: "Completed", cancelled: "Cancelled",
  err: "Error", net: "Couldn't reach the server.", insufficient: "Insufficient balance. Top up first.", outOfStock: "Not enough stock.", pack: "Count", limit: "Max per order", limitExceeded: "Over the per-order limit.",
  invalid: "Please check your input.", tooMany: "Too many requests. Try later.", maint: "The app is under maintenance.",
  needAmount: "Enter an amount, choose a wallet and a receipt image.", maintTitle: "Under maintenance", retry: "Try again",
};
export const tr = (l: L, k: string) => (l === "ar" ? AR[k] : EN[k]) ?? EN[k] ?? k;
export const errText = (l: L, code: string) =>
  tr(l, ({ network: "net", server: "net", insufficient_balance: "insufficient", out_of_stock: "outOfStock", limit_exceeded: "limitExceeded", invalid: "invalid", too_many: "tooMany", maintenance: "maint" } as Record<string, string>)[code] ?? "err");
