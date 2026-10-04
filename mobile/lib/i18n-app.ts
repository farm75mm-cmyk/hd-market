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
  err: "حدث خطأ", net: "تعذّر الاتصال بالخادم.", insufficient: "رصيدك غير كافٍ. اشحن رصيدك أولًا.", outOfStock: "الكمية غير متوفرة.", newReply: "رد جديد من الدعم", pack: "العدد", limit: "الحد المسموح", limitExceeded: "تجاوزت الحد المسموح للطلب الواحد.",
  invalid: "تحقق من البيانات المدخلة.", tooMany: "طلبات كثيرة. حاول لاحقًا.", maint: "التطبيق تحت الصيانة حاليًا.",
  needAmount: "أدخل المبلغ واختر المحفظة وصورة الإيصال.", maintTitle: "تحت الصيانة", retry: "إعادة المحاولة",
  currency: "العملة", allBalances: "أرصدتي", topupBtn: "شحن الرصيد", activeTopups: "طلبات الشحن الحالية", opHistory: "سجل العمليات", noOps: "لا توجد عمليات بعد.", noActive: "لا توجد طلبات شحن حالية.",
  st_awaiting_payment: "بانتظار الدفع", st_proof_sent: "تم إرسال إثبات الدفع", st_under_review: "قيد المراجعة", st_verifying: "قيد التحقق", st_approved: "تمت الموافقة", st_credited: "تمت إضافة الرصيد",
  st_rejected: "مرفوض", st_cancelled: "ملغي", st_expired: "منتهي الصلاحية", st_amount_mismatch: "مبلغ غير مطابق", st_reversed: "تم عكس العملية", st_done: "مكتملة",
  type_deposit: "شحن رصيد", type_purchase: "شراء", type_refund: "استرجاع مبلغ", type_reversal: "عكس عملية", type_migration: "رصيد سابق",
  chooseMethod: "اختر طريقة الدفع", noMethods: "لا توجد طرق دفع مفعلة حاليًا.", enterAmount: "أدخل المبلغ", minAmt: "الحد الأدنى", maxAmt: "الحد الأقصى", continue: "متابعة", payVia: "طريقة الدفع",
  txnId: "رقم العملية (Transaction ID)", userId: "رقم المستخدم", method: "طريقة الدفع", payInfo: "معلومات الدفع", instructions: "تعليمات الدفع", amountToTransfer: "المبلغ المطلوب تحويله", expiresIn: "ينتهي خلال", expiredNote: "انتهت صلاحية هذا الطلب. أنشئ طلبًا جديدًا برقم عملية جديد.",
  uploadProof: "اختيار صورة إثبات الدفع", sendProof: "إرسال إثبات الدفع", proofSentMsg: "تم إرسال إثبات الدفع. لا يُضاف الرصيد إلا بعد موافقة المسؤول.", cancelOrder: "إلغاء الطلب", confirmCancel: "إلغاء طلب الشحن؟",
  balBefore: "الرصيد قبل العملية", balAfter: "الرصيد بعد العملية", date: "التاريخ", time: "الوقت", updated: "آخر تحديث", reason: "السبب", statusLog: "سجل تغيّر الحالة", proof: "إثبات الدفع", paidAmount: "المبلغ المدفوع", fixedRate: "سعر الصرف المثبّت", details: "تفاصيل العملية", amountLbl: "المبلغ", statusLbl: "الحالة", createdAt: "تاريخ الإنشاء",
  notifications: "الإشعارات", noNotifs: "لا توجد إشعارات.", markAll: "تحديد الكل كمقروء", unread: "غير مقروء", read: "مقروء", copyId: "نسخ",
  outOfLimits: "المبلغ خارج الحد المسموح لطريقة الدفع.", badTransition: "تغيّرت حالة الطلب. حدّث الصفحة.", duplicate: "تمت معالجة هذه العملية مسبقًا.", needProof: "اختر صورة إثبات الدفع أولًا.", actor_user: "المستخدم", actor_admin: "المسؤول", actor_system: "النظام",
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
  err: "Error", net: "Couldn't reach the server.", insufficient: "Insufficient balance. Top up first.", outOfStock: "Not enough stock.", newReply: "New reply from support", pack: "Count", limit: "Max per order", limitExceeded: "Over the per-order limit.",
  invalid: "Please check your input.", tooMany: "Too many requests. Try later.", maint: "The app is under maintenance.",
  needAmount: "Enter an amount, choose a wallet and a receipt image.", maintTitle: "Under maintenance", retry: "Try again",
  currency: "Currency", allBalances: "My balances", topupBtn: "Top up", activeTopups: "Current top-up requests", opHistory: "Transaction history", noOps: "No transactions yet.", noActive: "No current top-up requests.",
  st_awaiting_payment: "Awaiting payment", st_proof_sent: "Payment proof sent", st_under_review: "Under review", st_verifying: "Verifying", st_approved: "Approved", st_credited: "Balance added",
  st_rejected: "Rejected", st_cancelled: "Cancelled", st_expired: "Expired", st_amount_mismatch: "Amount mismatch", st_reversed: "Reversed", st_done: "Completed",
  type_deposit: "Top-up", type_purchase: "Purchase", type_refund: "Refund", type_reversal: "Reversal", type_migration: "Previous balance",
  chooseMethod: "Choose a payment method", noMethods: "No payment methods are enabled right now.", enterAmount: "Enter the amount", minAmt: "Minimum", maxAmt: "Maximum", continue: "Continue", payVia: "Payment method",
  txnId: "Transaction ID", userId: "User ID", method: "Payment method", payInfo: "Payment details", instructions: "Payment instructions", amountToTransfer: "Amount to transfer", expiresIn: "Expires in", expiredNote: "This request has expired. Create a new request with a new Transaction ID.",
  uploadProof: "Choose payment proof image", sendProof: "Submit payment proof", proofSentMsg: "Payment proof sent. Balance is only added after admin approval.", cancelOrder: "Cancel request", confirmCancel: "Cancel this top-up request?",
  balBefore: "Balance before", balAfter: "Balance after", date: "Date", time: "Time", updated: "Last updated", reason: "Reason", statusLog: "Status history", proof: "Payment proof", paidAmount: "Paid amount", fixedRate: "Locked exchange rate", details: "Transaction details", amountLbl: "Amount", statusLbl: "Status", createdAt: "Created",
  notifications: "Notifications", noNotifs: "No notifications.", markAll: "Mark all as read", unread: "Unread", read: "Read", copyId: "Copy",
  outOfLimits: "The amount is outside this payment method's limits.", badTransition: "The request status changed. Refresh the page.", duplicate: "This operation was already processed.", needProof: "Choose a payment proof image first.", actor_user: "User", actor_admin: "Admin", actor_system: "System",
};
export const tr = (l: L, k: string) => (l === "ar" ? AR[k] : EN[k]) ?? EN[k] ?? k;
export const errText = (l: L, code: string) =>
  tr(l, ({ network: "net", server: "net", insufficient_balance: "insufficient", out_of_stock: "outOfStock", limit_exceeded: "limitExceeded", invalid: "invalid", too_many: "tooMany", maintenance: "maint", out_of_limits: "outOfLimits", bad_transition: "badTransition", duplicate: "duplicate" } as Record<string, string>)[code] ?? "err");
