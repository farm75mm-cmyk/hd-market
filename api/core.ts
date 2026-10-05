import postgres from "postgres";

// ---------- config ----------
export const env = (k: string, d = "") => Bun.env[k] ?? d;
export const SECRET = env("APP_SECRET");
export const ADMIN_USER = env("ADMIN_USER");
export const ADMIN_PASSWORD = env("ADMIN_PASSWORD");
export const ADMIN_EMAIL = (env("ADMIN_EMAIL") || "farm75mm@gmail.com").toLowerCase();
export const ORIGIN = env("ALLOWED_ORIGIN", "*");
export const NAME_DAYS = 15, MAX_FAILED = 5, LOCK_S = 300, TOKEN_TTL = 90 * 86400;
export const now = () => Math.floor(Date.now() / 1000);

// ---------- database (Postgres on Railway; SQLite only when DATABASE_URL is missing, for local tests) ----------
export type Row = Record<string, any>;
export type Q = (q: string, p?: any[]) => Promise<Row[]>;
export let run: Q;
export let withTx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>;
export let isSqlite = false;
if (env("DATABASE_URL")) {
  const sql = postgres(env("DATABASE_URL"), { max: 5, idle_timeout: 20, onnotice: () => {} });
  run = async (q, p = []) => Array.from(await sql.unsafe(q, p as any[]));
  withTx = (fn) => sql.begin(async (tx: any) => fn(async (q, p = []) => Array.from(await tx.unsafe(q, p as any[])))) as any;
} else {
  isSqlite = true;
  const { Database } = await import("bun:sqlite");
  const d = new Database(env("SQLITE_PATH", ":memory:"));
  run = async (q, p = []) => {
    const s = d.query(q.replace(/\$(\d+)/g, "?$1"));
    return /^\s*(select|with)|\breturning\b/i.test(q) ? (s.all(...p) as Row[]) : (s.run(...p), []);
  };
  let lock: Promise<any> = Promise.resolve();
  withTx = (fn) => {
    const t = lock.then(async () => {
      d.run("BEGIN");
      try { const r = await fn(run); d.run("COMMIT"); return r; } catch (e) { d.run("ROLLBACK"); throw e; }
    });
    lock = t.catch(() => {});
    return t;
  };
}
export const num = (v: any) => Number(v ?? 0);
export const first = async (q: string, p: any[] = []) => (await run(q, p))[0] as Row | undefined;
export const count = async (q: string, p: any[] = []) => num(Object.values((await first(q, p)) ?? { c: 0 })[0]);

export const serial = isSqlite ? "INTEGER PRIMARY KEY AUTOINCREMENT" : "BIGSERIAL PRIMARY KEY";
await run(`CREATE TABLE IF NOT EXISTS users (id ${serial}, username TEXT NOT NULL, username_lc TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, avatar TEXT, status TEXT NOT NULL DEFAULT 'active',
  failed INT NOT NULL DEFAULT 0, locked_until BIGINT NOT NULL DEFAULT 0, name_changed_at BIGINT NOT NULL DEFAULT 0,
  last_login BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS resets (id ${serial}, user_id BIGINT NOT NULL, code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, verified INT NOT NULL DEFAULT 0, reset_hash TEXT, created_at BIGINT NOT NULL)`);

try { await run(`ALTER TABLE users ADD COLUMN balance DOUBLE PRECISION NOT NULL DEFAULT 0`); } catch {}
await run(`CREATE TABLE IF NOT EXISTS categories (id ${serial}, name TEXT NOT NULL, image TEXT, sort INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS products (id ${serial}, category_id BIGINT NOT NULL, name TEXT NOT NULL, image TEXT, price DOUBLE PRECISION NOT NULL DEFAULT 0,
  qty INT NOT NULL DEFAULT 0, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);
try { await run(`ALTER TABLE categories ADD COLUMN name_en TEXT NOT NULL DEFAULT ''`); } catch {}
try { await run(`ALTER TABLE categories ADD COLUMN active INT NOT NULL DEFAULT 1`); } catch {}
try { await run(`ALTER TABLE products ADD COLUMN pack INT NOT NULL DEFAULT 1`); } catch {}
try { await run(`ALTER TABLE products ADD COLUMN max_order INT NOT NULL DEFAULT 0`); } catch {}
await run(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS wallets (id ${serial}, name TEXT NOT NULL, icon TEXT, number TEXT NOT NULL, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS orders (id ${serial}, user_id BIGINT NOT NULL, product_id BIGINT NOT NULL, product_name TEXT NOT NULL, qty INT NOT NULL,
  total DOUBLE PRECISION NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS topups (id ${serial}, user_id BIGINT NOT NULL, wallet_id BIGINT NOT NULL, wallet_name TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL,
  receipt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', note TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS messages (id ${serial}, user_id BIGINT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, seen INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS push_tokens (token TEXT PRIMARY KEY, user_id BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
try { await run(`ALTER TABLE push_tokens ADD COLUMN tone TEXT NOT NULL DEFAULT 'soft_bell'`); } catch {}
try { await run(`ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'JOD'`); } catch {}
await run(`CREATE TABLE IF NOT EXISTS user_wallets (user_id BIGINT NOT NULL, currency TEXT NOT NULL, amount NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (amount >= 0), updated_at BIGINT NOT NULL, PRIMARY KEY (user_id, currency))`);
await run(`CREATE TABLE IF NOT EXISTS payment_methods (id ${serial}, name TEXT NOT NULL, currency TEXT NOT NULL, icon TEXT, info TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '',
  min_amount NUMERIC(20,4) NOT NULL DEFAULT 0, max_amount NUMERIC(20,4) NOT NULL DEFAULT 0, expiry_minutes INT NOT NULL DEFAULT 60, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS deposit_orders (id ${serial}, txn_id TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL, method_id BIGINT NOT NULL, method_name TEXT NOT NULL, currency TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL, paid_amount NUMERIC(20,4), credit_amount NUMERIC(20,4), rate_usdt NUMERIC(20,8) NOT NULL DEFAULT 1, status TEXT NOT NULL, reject_reason TEXT, idem_key TEXT,
  balance_before NUMERIC(20,4), balance_after NUMERIC(20,4), admin_actor TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)`);
await run(`CREATE UNIQUE INDEX IF NOT EXISTS deposit_idem ON deposit_orders (user_id, idem_key)`);
await run(`CREATE TABLE IF NOT EXISTS payment_proofs (id ${serial}, order_id BIGINT NOT NULL UNIQUE, image TEXT NOT NULL, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS transactions (id ${serial}, txn_id TEXT NOT NULL UNIQUE, ref_key TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL, type TEXT NOT NULL, currency TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL, balance_before NUMERIC(20,4) NOT NULL, balance_after NUMERIC(20,4) NOT NULL, ref_txn_id TEXT, deposit_id BIGINT, note TEXT, actor TEXT, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS status_history (id ${serial}, order_id BIGINT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, actor TEXT NOT NULL, note TEXT, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS exchange_rates (currency TEXT PRIMARY KEY, per_usdt NUMERIC(20,8) NOT NULL, updated_at BIGINT NOT NULL, updated_by TEXT)`);
await run(`CREATE TABLE IF NOT EXISTS exchange_rate_history (id ${serial}, currency TEXT NOT NULL, old_rate NUMERIC(20,8), new_rate NUMERIC(20,8) NOT NULL, actor TEXT NOT NULL, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS notifications (id ${serial}, user_id BIGINT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, title_en TEXT, body_en TEXT, ref TEXT, is_read INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS audit_logs (id ${serial}, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT, entity_id TEXT, details TEXT, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS reversals (id ${serial}, deposit_id BIGINT NOT NULL UNIQUE, txn_id TEXT NOT NULL, reversal_txn_id TEXT NOT NULL, amount NUMERIC(20,4) NOT NULL, currency TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at BIGINT NOT NULL)`);
await run(`CREATE INDEX IF NOT EXISTS notif_user ON notifications (user_id, id)`);
await run(`CREATE INDEX IF NOT EXISTS dep_user ON deposit_orders (user_id, id)`);
await run(`CREATE INDEX IF NOT EXISTS tx_user ON transactions (user_id, id)`);
// Financial records can never be changed or deleted from SQL (enforced by the database itself).
if (isSqlite) {
  for (const t of ["audit_logs", "transactions", "status_history", "reversals", "payment_proofs", "exchange_rate_history"]) {
    try { await run(`CREATE TRIGGER IF NOT EXISTS ${t}_imm_d BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, 'immutable'); END`); } catch {}
    if (t !== "payment_proofs") try { await run(`CREATE TRIGGER IF NOT EXISTS ${t}_imm_u BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, 'immutable'); END`); } catch {}
  }
  try { await run(`CREATE TRIGGER IF NOT EXISTS deposit_orders_imm_d BEFORE DELETE ON deposit_orders BEGIN SELECT RAISE(ABORT, 'immutable'); END`); } catch {}
} else {
  try { await run(`CREATE OR REPLACE FUNCTION hd_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'immutable financial record'; END; $$ LANGUAGE plpgsql`); } catch {}
  for (const t of ["audit_logs", "transactions", "status_history", "reversals", "exchange_rate_history"]) {
    try { await run(`DROP TRIGGER IF EXISTS ${t}_imm ON ${t}`); await run(`CREATE TRIGGER ${t}_imm BEFORE UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION hd_immutable()`); } catch {}
  }
  for (const t of ["payment_proofs", "deposit_orders"]) {
    try { await run(`DROP TRIGGER IF EXISTS ${t}_imm ON ${t}`); await run(`CREATE TRIGGER ${t}_imm BEFORE DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION hd_immutable()`); } catch {}
  }
}
export const nowS = () => Math.floor(Date.now() / 1000);
for (const [c, r] of [["USDT", 1], ["JOD", 0.71], ["IQD", 1310]] as [string, number][])
  await run(`INSERT INTO exchange_rates (currency, per_usdt, updated_at, updated_by) VALUES ($1,$2,$3,'system') ON CONFLICT (currency) DO NOTHING`, [c, r, nowS()]);
export const getSet = async (k: string, d = "") => String((await first(`SELECT v FROM settings WHERE k = $1`, [k]))?.v ?? d);
export const putSet = async (k: string, v: string) => { await run(`DELETE FROM settings WHERE k = $1`, [k]); await run(`INSERT INTO settings (k, v) VALUES ($1, $2)`, [k, v]); };
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["seed_tools_v1"]))) {
  let order = 1;
  for (const n of ["أدوات حظيرة", "أدوات أرض", "أدوات صومعة"]) {
    if (!(await first(`SELECT 1 FROM categories WHERE name = $1`, [n]))) await run(`INSERT INTO categories (name, image, sort, created_at) VALUES ($1,NULL,$2,$3)`, [n, order, now()]);
    order++;
  }
  await putSet("seed_tools_v1", "1");
}
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["seed_tools_v2"]))) {
  const NEW = "أدوات الحظيرة والأرض والصومعة";
  const a = await first(`SELECT id FROM categories WHERE name = $1`, ["أدوات حظيرة"]);
  const others: any[] = [];
  for (const n of ["أدوات أرض", "أدوات صومعة"]) { const r = await first(`SELECT id FROM categories WHERE name = $1`, [n]); if (r) others.push(r.id); }
  if (a) {
    await run(`UPDATE categories SET name = $1, sort = 1 WHERE id = $2`, [NEW, a.id]);
    for (const o of others) { await run(`UPDATE products SET category_id = $1 WHERE category_id = $2`, [a.id, o]); await run(`DELETE FROM categories WHERE id = $1`, [o]); }
  } else if (!(await first(`SELECT 1 FROM categories WHERE name = $1`, [NEW]))) {
    await run(`INSERT INTO categories (name, image, sort, created_at) VALUES ($1,NULL,1,$2)`, [NEW, now()]);
  }
  await putSet("seed_tools_v2", "1");
}
// ---------- one-time migration from the single-balance system ----------
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["mig_wallet_v1"]))) {
  await withTx(async (q) => {
    for (const u of await q(`SELECT id, balance FROM users WHERE balance > 0`)) {
      const bal = Math.round(num(u.balance) * 1e4) / 1e4;
      await q(`INSERT INTO user_wallets (user_id, currency, amount, updated_at) VALUES ($1,'JOD',$2,$3) ON CONFLICT (user_id, currency) DO NOTHING`, [u.id, bal, nowS()]);
      await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, note, actor, created_at) VALUES ($1,$2,$3,'migration','JOD',$4,0,$4,'رصيد منقول من النظام القديم','system',$5)`, ["TX-MIG" + u.id, "mig:" + u.id, u.id, bal, nowS()]);
      await q(`UPDATE users SET balance = 0 WHERE id = $1`, [u.id]);
    }
    await q(`DELETE FROM settings WHERE k = 'mig_wallet_v1'`);
    await q(`INSERT INTO settings (k, v) VALUES ('mig_wallet_v1', '1')`);
  });
}
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["mig_methods_v1"]))) {
  await withTx(async (q) => {
    for (const w of await q(`SELECT * FROM wallets ORDER BY id`))
      await q(`INSERT INTO payment_methods (name, currency, icon, info, instructions, min_amount, max_amount, expiry_minutes, active, created_at, updated_at) VALUES ($1,'JOD',$2,$3,'',0,0,60,$4,$5,$5)`, [w.name, w.icon ?? null, w.number, num(w.active) ? 1 : 0, nowS()]);
    for (const t of await q(`SELECT * FROM topups ORDER BY id`)) {
      const st = t.status === "approved" ? "credited" : t.status === "rejected" ? "rejected" : "proof_sent";
      const o = await q(`INSERT INTO deposit_orders (txn_id, user_id, method_id, method_name, currency, amount, credit_amount, rate_usdt, status, reject_reason, created_at, updated_at, expires_at) VALUES ($1,$2,0,$3,'JOD',$4,$5,0.71,$6,$7,$8,$9,$9) RETURNING id`,
        ["DEP-LEG" + t.id, t.user_id, t.wallet_name, t.amount, st === "credited" ? t.amount : null, st, t.note ?? null, t.created_at, t.updated_at]);
      await q(`INSERT INTO payment_proofs (order_id, image, created_at) VALUES ($1,$2,$3)`, [o[0].id, t.receipt, t.created_at]);
      await q(`INSERT INTO status_history (order_id, from_status, to_status, actor, note, created_at) VALUES ($1,NULL,$2,'system','منقول من النظام القديم',$3)`, [o[0].id, st, t.updated_at]);
    }
    await q(`DELETE FROM settings WHERE k = 'mig_methods_v1'`);
    await q(`INSERT INTO settings (k, v) VALUES ('mig_methods_v1', '1')`);
  });
}
export const ADMIN_ACTOR = "admin:" + (env("ADMIN_USER") || "admin");
export const IMG_RE =/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
export const okImg = (v: any) => typeof v === "string" && v.length <= 450000 && IMG_RE.test(v);
export const ORDER_STATUS: Record<string, string> = { new: "جديد", processing: "قيد التنفيذ", done: "مكتمل", cancelled: "ملغي" };

// ---------- helpers ----------
export const hmac = (key: string, data: string) => new Bun.CryptoHasher("sha256", key).update(data).digest("hex");
export const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
export const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
export const safeEq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
export const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
export class Fail extends Error { constructor(public code: string, public status = 400, public extra: Row = {}) { super(code); } }
export const ok = (data: Row = {}) => json({ ok: true, ...data });
export const h = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const validName = (n: string) => [...n].length >= 2 && [...n].length <= 30;
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 190;

export const payload = (u: Row) => ({ username: u.username, email: u.email, created: num(u.created_at), avatar: u.avatar ?? null, nameChangedAt: num(u.name_changed_at), balance: 0, balances: { JOD: 0, IQD: 0, USDT: 0 } });
export const pl = async (u: Row) => { const b = await balancesOf(u.id); return { ...payload(u), balance: b.JOD, balances: b }; };

export async function authUser(b: Row) {
  const t = String(b.token ?? "");
  if (!/^[a-f0-9]{64}$/.test(t)) throw new Fail("unauthorized", 401);
  const u = await first(`SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.created_at > $2`, [sha(t), now() - TOKEN_TTL]);
  if (!u || u.status !== "active") throw new Fail("unauthorized", 401);
  return u;
}
export async function makeToken(uid: any) {
  const t = rnd(32);
  await run(`INSERT INTO tokens (token_hash, user_id, created_at) VALUES ($1,$2,$3)`, [sha(t), uid, now()]);
  return t;
}

export async function sendResetMail(to: string, lang: string, code: string) {
  const key = env("RESEND_API_KEY");
  if (!key) return false;
  const T: Record<string, [string, string]> = {
    ar: ["كود استعادة كلمة المرور - HD Market", `كودك هو: ${code}\nصالح لمدة 10 دقائق. إذا لم تطلبه فتجاهل هذه الرسالة.`],
    en: ["Your HD Market password reset code", `Your code is: ${code}\nIt is valid for 10 minutes. If you didn't request it, ignore this email.`],
    vi: ["Mã khôi phục mật khẩu HD Market", `Mã của bạn là: ${code}\nCó hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`],
    zh: ["HD Market 密码重置验证码", `你的验证码是：${code}\n10分钟内有效。如果不是你本人操作，请忽略此邮件。`],
  };
  const t = T[lang] ?? T.ar;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("MAIL_FROM", "HD Market <onboarding@resend.dev>"), to: [to], subject: t[0], text: t[1] }),
    });
    return r.ok;
  } catch { return false; }
}

// ---------- wallet core ----------
export const CURRENCIES = ["JOD", "IQD", "USDT"];
export const DEC: Record<string, number> = { JOD: 3, IQD: 0, USDT: 4 };
export const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
export const txid = (p: string) => `${p}-${rnd(6).toUpperCase()}`;
export const STATUS_AR: Record<string, string> = { awaiting_payment: "بانتظار الدفع", proof_sent: "تم إرسال إثبات الدفع", under_review: "قيد المراجعة", verifying: "قيد التحقق", approved: "تمت الموافقة", credited: "تمت إضافة الرصيد", rejected: "مرفوض", cancelled: "ملغي", expired: "منتهي الصلاحية", amount_mismatch: "مبلغ غير مطابق", reversed: "تم عكس العملية" };
// The only allowed status transitions. Anything else is refused by the server.
export const FLOW: Record<string, string[]> = {
  awaiting_payment: ["proof_sent", "cancelled", "expired"],
  proof_sent: ["under_review", "verifying", "amount_mismatch", "rejected", "approved", "cancelled"],
  under_review: ["verifying", "amount_mismatch", "rejected", "approved"],
  verifying: ["under_review", "amount_mismatch", "rejected", "approved"],
  amount_mismatch: ["under_review", "rejected", "approved"],
  approved: ["credited"],
  credited: ["reversed"],
  rejected: [], cancelled: [], expired: [], reversed: [],
};
export const NOTE: Record<string, [string, string, string, string]> = {
  created: ["تم إنشاء طلب شحن", "تم إنشاء طلب الشحن {t} بقيمة {a} {c}. حوّل المبلغ ثم أرفق إثبات الدفع.", "Top-up request created", "Top-up request {t} for {a} {c} was created. Transfer the amount and upload the proof."],
  proof_sent: ["تم استلام إثبات الدفع", "استلمنا إثبات الدفع للطلب {t}. لم تُضف أي أرصدة بعد.", "Payment proof received", "We received the payment proof for {t}. No balance has been added yet."],
  under_review: ["طلبك قيد المراجعة", "الطلب {t} قيد المراجعة.", "Your request is under review", "Request {t} is under review."],
  verifying: ["طلبك قيد التحقق", "الطلب {t} قيد التحقق من الدفع.", "Your request is being verified", "Request {t} is being verified."],
  approved: ["تمت الموافقة على طلبك", "تمت الموافقة على الطلب {t}.", "Your request was approved", "Request {t} was approved."],
  credited: ["تمت إضافة الرصيد", "تمت إضافة {a} {c} إلى محفظتك (الطلب {t}).", "Balance added", "{a} {c} was added to your wallet (request {t})."],
  rejected: ["تم رفض الطلب", "تم رفض الطلب {t}. سبب الرفض: {r}", "Request rejected", "Request {t} was rejected. Reason: {r}"],
  amount_mismatch: ["المبلغ غير مطابق", "المبلغ المدفوع لا يطابق المبلغ المطلوب في الطلب {t}. سيراجعه المسؤول.", "Amount mismatch", "The paid amount does not match the requested amount in request {t}. An admin will review it."],
  expired: ["انتهت صلاحية الطلب", "انتهت صلاحية الطلب {t}. أنشئ طلبًا جديدًا إذا أردت الدفع.", "Request expired", "Request {t} has expired. Create a new request if you still want to pay."],
  cancelled: ["تم إلغاء الطلب", "تم إلغاء الطلب {t}.", "Request cancelled", "Request {t} was cancelled."],
  reversed: ["تم عكس العملية", "تم عكس العملية {t}. السبب: {r}", "Transaction reversed", "Transaction {t} was reversed. Reason: {r}"],
};
export type Push = { uid: number; title: string; body: string };
export const fill = (t: string, o: Row, extra: Row) => t.replace(/\{(\w)\}/g, (_, k) => String(({ t: o.txn_id, a: extra.a ?? o.amount, c: o.currency, r: extra.r ?? "—" } as Row)[k] ?? ""));

export async function audit(q: Q, actor: string, action: string, entity = "", entityId: any = "", details: any = {}) {
  await q(`INSERT INTO audit_logs (actor, action, entity, entity_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [actor, action, entity, String(entityId), JSON.stringify(details).slice(0, 2000), nowS()]);
}
export async function notify(q: Q, pushes: Push[], o: Row, kind: string, extra: Row = {}) {
  const n = NOTE[kind]; if (!n) return;
  const title = n[0], body = fill(n[1], o, extra);
  await q(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [o.user_id, kind, title, body, n[2], fill(n[3], o, extra), o.txn_id, nowS()]);
  pushes.push({ uid: Number(o.user_id), title, body });
}
export async function getRates(q: Q = run): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const x of await q(`SELECT currency, per_usdt FROM exchange_rates`)) r[x.currency] = num(x.per_usdt);
  return r;
}
/** price in USDT (base currency of the whole store) -> amount in `cur`, rounded UP to the currency's precision. */
export function fromUsdt(usdt: number, cur: string, rt: Record<string, number>) {
  const v = usdt * (cur === "USDT" ? 1 : rt[cur] ?? 1), f = 10 ** DEC[cur];
  return Math.ceil(v * f - 1e-7) / f;
}
/** any wallet-currency amount -> USDT (for reports). */
export function toUsdt(amount: number, cur: string, rt: Record<string, number>) {
  return cur === "USDT" ? amount : amount / (rt[cur] || 1);
}
/** Moves an order to a new status only along FLOW; the WHERE clause makes double-clicks and races harmless. */
export async function moveTo(q: Q, o: Row, to: string, actor: string, note = "", set: Row = {}): Promise<Row> {
  if (!(FLOW[o.status] ?? []).includes(to)) throw new Fail("bad_transition", 409, { from: o.status, to });
  const cols = Object.keys(set);
  const r = await q(`UPDATE deposit_orders SET status = $1, updated_at = $2${cols.map((c, i) => `, ${c} = $${i + 5}`).join("")} WHERE id = $3 AND status = $4 RETURNING *`, [to, nowS(), o.id, o.status, ...cols.map((c) => set[c])]);
  if (!r.length) throw new Fail("bad_transition", 409, { from: o.status, to });
  await q(`INSERT INTO status_history (order_id, from_status, to_status, actor, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [o.id, o.status, to, actor, note.slice(0, 300), nowS()]);
  return r[0];
}
export const isDup = (e: any) => /unique|duplicate/i.test(String(e?.message ?? e));
/** approved -> credited: wallet update + ledger row + status in ONE database transaction. */
export async function creditOrder(q: Q, pushes: Push[], o0: Row, actor: string, amount: number, note = ""): Promise<Row> {
  if (!(amount > 0)) throw new Fail("invalid");
  let o = await moveTo(q, o0, "approved", actor, note, { admin_actor: actor });
  await notify(q, pushes, o, "approved");
  await q(`INSERT INTO user_wallets (user_id, currency, amount, updated_at) VALUES ($1,$2,0,$3) ON CONFLICT (user_id, currency) DO NOTHING`, [o.user_id, o.currency, nowS()]);
  const w = await q(`UPDATE user_wallets SET amount = amount + $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 RETURNING amount`, [amount, nowS(), o.user_id, o.currency]);
  const after = num(w[0].amount), before = r4(after - amount), tid = txid("TX");
  try {
    await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, ref_txn_id, deposit_id, note, actor, created_at) VALUES ($1,$2,$3,'deposit',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tid, "dep:" + o.id, o.user_id, o.currency, amount, before, after, o.txn_id, o.id, note.slice(0, 300), actor, nowS()]);
  } catch (e) { if (isDup(e)) throw new Fail("duplicate", 409); throw e; }
  o = await moveTo(q, o, "credited", actor, note, { balance_before: before, balance_after: after, credit_amount: amount, admin_actor: actor });
  await audit(q, actor, "credit_balance", "deposit_order", o.txn_id, { user: o.user_id, amount, currency: o.currency, before, after });
  await notify(q, pushes, o, "credited", { a: amount });
  return o;
}
export async function reverseOrder(q: Q, pushes: Push[], o0: Row, actor: string, reason: string): Promise<Row> {
  const amount = num(o0.credit_amount);
  if (o0.status !== "credited" || !(amount > 0)) throw new Fail("bad_transition", 409);
  const w = await q(`UPDATE user_wallets SET amount = amount - $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 AND amount >= $1 RETURNING amount`, [amount, nowS(), o0.user_id, o0.currency]);
  if (!w.length) throw new Fail("insufficient_for_reversal", 409);
  const after = num(w[0].amount), before = r4(after + amount), tid = txid("TX");
  try {
    await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, ref_txn_id, deposit_id, note, actor, created_at) VALUES ($1,$2,$3,'reversal',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tid, "rev:" + o0.id, o0.user_id, o0.currency, -amount, before, after, o0.txn_id, o0.id, reason.slice(0, 300), actor, nowS()]);
    await q(`INSERT INTO reversals (deposit_id, txn_id, reversal_txn_id, amount, currency, reason, actor, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [o0.id, o0.txn_id, tid, amount, o0.currency, reason.slice(0, 300), actor, nowS()]);
  } catch (e) { if (isDup(e)) throw new Fail("duplicate", 409); throw e; }
  const o = await moveTo(q, o0, "reversed", actor, reason, { reject_reason: reason.slice(0, 300), admin_actor: actor });
  await audit(q, actor, "reverse_deposit", "deposit_order", o.txn_id, { amount, currency: o.currency, reason, reversal_txn: tid });
  await notify(q, pushes, o, "reversed", { r: reason });
  return o;
}
export async function flushPush(pushes: Push[]) { for (const p of pushes) await pushTo(p.uid, "HD Market", p.title + " — " + p.body, "notifications"); }
export async function expireStale() {
  try {
    for (const o of await run(`SELECT * FROM deposit_orders WHERE status = 'awaiting_payment' AND expires_at < $1 LIMIT 50`, [nowS()])) {
      const pushes: Push[] = [];
      try { await withTx(async (q) => { const e = await moveTo(q, o, "expired", "system", "انتهت المدة"); await audit(q, "system", "expire_deposit", "deposit_order", e.txn_id, {}); await notify(q, pushes, e, "expired"); }); await flushPush(pushes); } catch {}
    }
  } catch {}
}
setInterval(expireStale, 60000);
export const depOut = (o: Row) => ({
  id: num(o.id), txn_id: o.txn_id, method_id: num(o.method_id), method_name: o.method_name, currency: o.currency, amount: num(o.amount),
  paid_amount: o.paid_amount == null ? null : num(o.paid_amount), credit_amount: o.credit_amount == null ? null : num(o.credit_amount), status: o.status,
  reject_reason: o.reject_reason ?? null, balance_before: o.balance_before == null ? null : num(o.balance_before), balance_after: o.balance_after == null ? null : num(o.balance_after),
  created_at: num(o.created_at), updated_at: num(o.updated_at), expires_at: num(o.expires_at),
});
export async function balancesOf(uid: any, q: Q = run) {
  const b: Record<string, number> = { JOD: 0, IQD: 0, USDT: 0 };
  for (const w of await q(`SELECT currency, amount FROM user_wallets WHERE user_id = $1`, [uid])) b[w.currency] = num(w.amount);
  return b;
}

export const TONES = ["soft_bell", "bell", "marimba", "harp", "bubble", "digital", "loud", "calm", "ding", "silent"];
export async function pushTo(uid: number, title: string, body: string, screen: string) {
  const rows = await run(`SELECT token, tone FROM push_tokens WHERE user_id = $1`, [uid]);
  if (!rows.length) return;
  try {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(rows.map((x) => ({ to: x.token, title, body, data: { screen }, sound: x.tone === "silent" ? null : `hd_${x.tone}.wav`, channelId: `hd_support_${x.tone}`, priority: "high" }))),
    });
    const j: any = await r.json().catch(() => ({}));
    const list: any[] = Array.isArray(j.data) ? j.data : [];
    for (let i = 0; i < list.length; i++) if (list[i]?.details?.error === "DeviceNotRegistered") await run(`DELETE FROM push_tokens WHERE token = $1`, [rows[i].token]);
  } catch {}
}
export const sendPush = (uid: number) => pushTo(uid, "HD Market", "وصل رد جديد من الدعم", "support");
