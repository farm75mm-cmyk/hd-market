import postgres from "postgres";

// ---------- config ----------
const env = (k: string, d = "") => Bun.env[k] ?? d;
const SECRET = env("APP_SECRET");
const ADMIN_USER = env("ADMIN_USER");
const ADMIN_PASSWORD = env("ADMIN_PASSWORD");
const ADMIN_EMAIL = (env("ADMIN_EMAIL") || "farm75mm@gmail.com").toLowerCase();
const ORIGIN = env("ALLOWED_ORIGIN", "*");
const NAME_DAYS = 15, MAX_FAILED = 5, LOCK_S = 300, TOKEN_TTL = 90 * 86400;
const now = () => Math.floor(Date.now() / 1000);

// ---------- database (Postgres on Railway; SQLite only when DATABASE_URL is missing, for local tests) ----------
type Row = Record<string, any>;
type Q = (q: string, p?: any[]) => Promise<Row[]>;
let run: Q;
let withTx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>;
let isSqlite = false;
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
const num = (v: any) => Number(v ?? 0);
const first = async (q: string, p: any[] = []) => (await run(q, p))[0] as Row | undefined;
const count = async (q: string, p: any[] = []) => num(Object.values((await first(q, p)) ?? { c: 0 })[0]);

const serial = isSqlite ? "INTEGER PRIMARY KEY AUTOINCREMENT" : "BIGSERIAL PRIMARY KEY";
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
const nowS = () => Math.floor(Date.now() / 1000);
for (const [c, r] of [["USDT", 1], ["JOD", 0.71], ["IQD", 1310]] as [string, number][])
  await run(`INSERT INTO exchange_rates (currency, per_usdt, updated_at, updated_by) VALUES ($1,$2,$3,'system') ON CONFLICT (currency) DO NOTHING`, [c, r, nowS()]);
const getSet = async (k: string, d = "") => String((await first(`SELECT v FROM settings WHERE k = $1`, [k]))?.v ?? d);
const putSet = async (k: string, v: string) => { await run(`DELETE FROM settings WHERE k = $1`, [k]); await run(`INSERT INTO settings (k, v) VALUES ($1, $2)`, [k, v]); };
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
const ADMIN_ACTOR = "admin:" + (env("ADMIN_USER") || "admin");
const IMG_RE =/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
const okImg = (v: any) => typeof v === "string" && v.length <= 450000 && IMG_RE.test(v);
const ORDER_STATUS: Record<string, string> = { new: "جديد", processing: "قيد التنفيذ", done: "مكتمل", cancelled: "ملغي" };

// ---------- helpers ----------
const hmac = (key: string, data: string) => new Bun.CryptoHasher("sha256", key).update(data).digest("hex");
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const safeEq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
class Fail extends Error { constructor(public code: string, public status = 400, public extra: Row = {}) { super(code); } }
const ok = (data: Row = {}) => json({ ok: true, ...data });
const h = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const validName = (n: string) => [...n].length >= 2 && [...n].length <= 30;
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 190;

const payload = (u: Row) => ({ username: u.username, email: u.email, created: num(u.created_at), avatar: u.avatar ?? null, nameChangedAt: num(u.name_changed_at), balance: 0, balances: { JOD: 0, IQD: 0, USDT: 0 } });
const pl = async (u: Row) => { const b = await balancesOf(u.id); return { ...payload(u), balance: b.JOD, balances: b }; };

async function authUser(b: Row) {
  const t = String(b.token ?? "");
  if (!/^[a-f0-9]{64}$/.test(t)) throw new Fail("unauthorized", 401);
  const u = await first(`SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.created_at > $2`, [sha(t), now() - TOKEN_TTL]);
  if (!u || u.status !== "active") throw new Fail("unauthorized", 401);
  return u;
}
async function makeToken(uid: any) {
  const t = rnd(32);
  await run(`INSERT INTO tokens (token_hash, user_id, created_at) VALUES ($1,$2,$3)`, [sha(t), uid, now()]);
  return t;
}

async function sendResetMail(to: string, lang: string, code: string) {
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
const CURRENCIES = ["JOD", "IQD", "USDT"];
const DEC: Record<string, number> = { JOD: 3, IQD: 0, USDT: 2 };
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const txid = (p: string) => `${p}-${rnd(6).toUpperCase()}`;
const STATUS_AR: Record<string, string> = { awaiting_payment: "بانتظار الدفع", proof_sent: "تم إرسال إثبات الدفع", under_review: "قيد المراجعة", verifying: "قيد التحقق", approved: "تمت الموافقة", credited: "تمت إضافة الرصيد", rejected: "مرفوض", cancelled: "ملغي", expired: "منتهي الصلاحية", amount_mismatch: "مبلغ غير مطابق", reversed: "تم عكس العملية" };
// The only allowed status transitions. Anything else is refused by the server.
const FLOW: Record<string, string[]> = {
  awaiting_payment: ["proof_sent", "cancelled", "expired"],
  proof_sent: ["under_review", "verifying", "amount_mismatch", "rejected", "approved", "cancelled"],
  under_review: ["verifying", "amount_mismatch", "rejected", "approved"],
  verifying: ["under_review", "amount_mismatch", "rejected", "approved"],
  amount_mismatch: ["under_review", "rejected", "approved"],
  approved: ["credited"],
  credited: ["reversed"],
  rejected: [], cancelled: [], expired: [], reversed: [],
};
const NOTE: Record<string, [string, string, string, string]> = {
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
type Push = { uid: number; title: string; body: string };
const fill = (t: string, o: Row, extra: Row) => t.replace(/\{(\w)\}/g, (_, k) => String(({ t: o.txn_id, a: extra.a ?? o.amount, c: o.currency, r: extra.r ?? "—" } as Row)[k] ?? ""));

async function audit(q: Q, actor: string, action: string, entity = "", entityId: any = "", details: any = {}) {
  await q(`INSERT INTO audit_logs (actor, action, entity, entity_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [actor, action, entity, String(entityId), JSON.stringify(details).slice(0, 2000), nowS()]);
}
async function notify(q: Q, pushes: Push[], o: Row, kind: string, extra: Row = {}) {
  const n = NOTE[kind]; if (!n) return;
  const title = n[0], body = fill(n[1], o, extra);
  await q(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [o.user_id, kind, title, body, n[2], fill(n[3], o, extra), o.txn_id, nowS()]);
  pushes.push({ uid: Number(o.user_id), title, body });
}
async function getRates(q: Q = run): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const x of await q(`SELECT currency, per_usdt FROM exchange_rates`)) r[x.currency] = num(x.per_usdt);
  return r;
}
/** price in JOD (base currency) -> amount in `cur`, rounded up to the currency's precision. */
function fromJod(jod: number, cur: string, rt: Record<string, number>) {
  if (cur === "JOD") return Math.ceil(jod * 1000 - 1e-6) / 1000;
  const v = (jod / rt.JOD) * rt[cur], f = 10 ** DEC[cur];
  return Math.ceil(v * f - 1e-6) / f;
}
/** Moves an order to a new status only along FLOW; the WHERE clause makes double-clicks and races harmless. */
async function moveTo(q: Q, o: Row, to: string, actor: string, note = "", set: Row = {}): Promise<Row> {
  if (!(FLOW[o.status] ?? []).includes(to)) throw new Fail("bad_transition", 409, { from: o.status, to });
  const cols = Object.keys(set);
  const r = await q(`UPDATE deposit_orders SET status = $1, updated_at = $2${cols.map((c, i) => `, ${c} = $${i + 5}`).join("")} WHERE id = $3 AND status = $4 RETURNING *`, [to, nowS(), o.id, o.status, ...cols.map((c) => set[c])]);
  if (!r.length) throw new Fail("bad_transition", 409, { from: o.status, to });
  await q(`INSERT INTO status_history (order_id, from_status, to_status, actor, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [o.id, o.status, to, actor, note.slice(0, 300), nowS()]);
  return r[0];
}
const isDup = (e: any) => /unique|duplicate/i.test(String(e?.message ?? e));
/** approved -> credited: wallet update + ledger row + status in ONE database transaction. */
async function creditOrder(q: Q, pushes: Push[], o0: Row, actor: string, amount: number, note = ""): Promise<Row> {
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
async function reverseOrder(q: Q, pushes: Push[], o0: Row, actor: string, reason: string): Promise<Row> {
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
async function flushPush(pushes: Push[]) { for (const p of pushes) await pushTo(p.uid, "HD Market", p.title + " — " + p.body, "notifications"); }
async function expireStale() {
  try {
    for (const o of await run(`SELECT * FROM deposit_orders WHERE status = 'awaiting_payment' AND expires_at < $1 LIMIT 50`, [nowS()])) {
      const pushes: Push[] = [];
      try { await withTx(async (q) => { const e = await moveTo(q, o, "expired", "system", "انتهت المدة"); await audit(q, "system", "expire_deposit", "deposit_order", e.txn_id, {}); await notify(q, pushes, e, "expired"); }); await flushPush(pushes); } catch {}
    }
  } catch {}
}
setInterval(expireStale, 60000);
const depOut = (o: Row) => ({
  id: num(o.id), txn_id: o.txn_id, method_id: num(o.method_id), method_name: o.method_name, currency: o.currency, amount: num(o.amount),
  paid_amount: o.paid_amount == null ? null : num(o.paid_amount), credit_amount: o.credit_amount == null ? null : num(o.credit_amount), status: o.status,
  reject_reason: o.reject_reason ?? null, balance_before: o.balance_before == null ? null : num(o.balance_before), balance_after: o.balance_after == null ? null : num(o.balance_after),
  created_at: num(o.created_at), updated_at: num(o.updated_at), expires_at: num(o.expires_at),
});
async function balancesOf(uid: any, q: Q = run) {
  const b: Record<string, number> = { JOD: 0, IQD: 0, USDT: 0 };
  for (const w of await q(`SELECT currency, amount FROM user_wallets WHERE user_id = $1`, [uid])) b[w.currency] = num(w.amount);
  return b;
}

const TONES = ["soft_bell", "bell", "marimba", "harp", "bubble", "digital", "loud", "calm", "ding", "silent"];
async function pushTo(uid: number, title: string, body: string, screen: string) {
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
const sendPush = (uid: number) => pushTo(uid, "HD Market", "وصل رد جديد من الدعم", "support");

// ---------- API ----------
const API: Record<string, (b: Row) => Promise<Response>> = {
  async register(b) {
    const username = String(b.username ?? "").trim(), email = String(b.email ?? "").trim().toLowerCase(), pass = String(b.password ?? "");
    if (!validName(username)) throw new Fail("invalid_username");
    if (!validEmail(email)) throw new Fail("invalid_email");
    if (pass.length < 8 || pass.length > 200) throw new Fail("short_password");
    if (await first(`SELECT 1 FROM users WHERE email = $1`, [email])) throw new Fail("email_taken", 409);
    if (await first(`SELECT 1 FROM users WHERE username_lc = $1`, [username.toLowerCase()])) throw new Fail("username_taken", 409);
    await run(`INSERT INTO users (username, username_lc, email, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [username, username.toLowerCase(), email, await Bun.password.hash(pass), now()]);
    return ok();
  },
  async login(b) {
    const id = String(b.username ?? "").trim().toLowerCase(), pass = String(b.password ?? "");
    if (!id || !pass) throw new Fail("invalid");
    const u = await first(`SELECT * FROM users WHERE username_lc = $1 OR email = $1`, [id]);
    if (!u) throw new Fail("no_account", 404);
    if (u.status !== "active") throw new Fail("banned", 403);
    const t = now();
    if (num(u.locked_until) > t) throw new Fail("locked", 429, { minutes: Math.ceil((num(u.locked_until) - t) / 60) });
    if (!(await Bun.password.verify(pass, u.password_hash))) {
      const failed = num(u.failed) + 1;
      if (failed >= MAX_FAILED) {
        await run(`UPDATE users SET failed = 0, locked_until = $1 WHERE id = $2`, [t + LOCK_S, u.id]);
        throw new Fail("locked", 429, { minutes: LOCK_S / 60 });
      }
      await run(`UPDATE users SET failed = $1 WHERE id = $2`, [failed, u.id]);
      throw new Fail("wrong_password", 401);
    }
    await run(`UPDATE users SET failed = 0, locked_until = 0, last_login = $1 WHERE id = $2`, [t, u.id]);
    return ok({ token: await makeToken(u.id), ...(await pl(u)) });
  },
  async me(b) { return ok(await pl(await authUser(b))); },
  async logout(b) {
    const t = String(b.token ?? "");
    if (/^[a-f0-9]{64}$/.test(t)) {
      const row = await first(`SELECT user_id FROM tokens WHERE token_hash = $1`, [sha(t)]);
      if (row) await run(`DELETE FROM push_tokens WHERE user_id = $1`, [row.user_id]);
      await run(`DELETE FROM tokens WHERE token_hash = $1`, [sha(t)]);
    }
    return ok();
  },
  async profile(b) {
    const u = await authUser(b);
    if ("username" in b) {
      const name = String(b.username ?? "").trim();
      if (!validName(name)) throw new Fail("invalid_username");
      if (name !== u.username) {
        const left = Math.ceil((num(u.name_changed_at) + NAME_DAYS * 86400 - now()) / 86400);
        if (num(u.name_changed_at) && left > 0) throw new Fail("too_soon", 429, { days: left });
        if (await first(`SELECT 1 FROM users WHERE username_lc = $1 AND id <> $2`, [name.toLowerCase(), u.id])) throw new Fail("username_taken", 409);
        await run(`UPDATE users SET username = $1, username_lc = $2, name_changed_at = $3 WHERE id = $4`, [name, name.toLowerCase(), now(), u.id]);
      }
    }
    if ("avatar" in b) {
      const av = b.avatar;
      if (av !== null && (typeof av !== "string" || av.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(av))) throw new Fail("invalid_avatar");
      await run(`UPDATE users SET avatar = $1 WHERE id = $2`, [av, u.id]);
    }
    return ok(await pl((await first(`SELECT * FROM users WHERE id = $1`, [u.id]))!));
  },
  async forgot(b) {
    const email = String(b.email ?? "").trim().toLowerCase(), lang = String(b.lang ?? "ar");
    if (!validEmail(email)) throw new Fail("invalid_email");
    const u = await first(`SELECT * FROM users WHERE email = $1`, [email]);
    if (!u) throw new Fail("no_account", 404);
    if (u.status !== "active") throw new Fail("banned", 403);
    if ((await count(`SELECT COUNT(*) c FROM resets WHERE user_id = $1 AND created_at > $2`, [u.id, now() - 3600])) >= 5) throw new Fail("too_many", 429);
    const code = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
    await run(`DELETE FROM resets WHERE user_id = $1`, [u.id]);
    await run(`INSERT INTO resets (user_id, code_hash, expires_at, created_at) VALUES ($1,$2,$3,$4)`, [u.id, hmac(SECRET + u.id, code), now() + 600, now()]);
    if (!(await sendResetMail(email, lang, code))) {
      if (env("DEBUG_RETURN_CODE") === "1") return ok({ debug_code: code });
      throw new Fail("mail_failed", 502);
    }
    return ok();
  },
  async verify(b) {
    const email = String(b.email ?? "").trim().toLowerCase(), code = String(b.code ?? "").replace(/\D/g, "");
    const u = await first(`SELECT id FROM users WHERE email = $1`, [email]);
    const r = u && (await first(`SELECT * FROM resets WHERE user_id = $1`, [u.id]));
    if (!u || !r || num(r.expires_at) < now() || num(r.attempts) >= 5) throw new Fail("invalid_code");
    if (!safeEq(r.code_hash, hmac(SECRET + u.id, code))) {
      await run(`UPDATE resets SET attempts = attempts + 1 WHERE id = $1`, [r.id]);
      throw new Fail("invalid_code");
    }
    const tok = rnd(24);
    await run(`UPDATE resets SET verified = 1, reset_hash = $1 WHERE id = $2`, [sha(tok), r.id]);
    return ok({ reset_token: tok });
  },
  async reset(b) {
    const email = String(b.email ?? "").trim().toLowerCase(), tok = String(b.reset_token ?? ""), pass = String(b.password ?? "");
    if (pass.length < 8 || pass.length > 200) throw new Fail("short_password");
    const u = await first(`SELECT id FROM users WHERE email = $1`, [email]);
    const r = u && (await first(`SELECT * FROM resets WHERE user_id = $1 AND verified = 1`, [u.id]));
    if (!u || !r || num(r.expires_at) < now() || !safeEq(String(r.reset_hash ?? ""), sha(tok))) throw new Fail("invalid_code");
    await run(`UPDATE users SET password_hash = $1, failed = 0, locked_until = 0 WHERE id = $2`, [await Bun.password.hash(pass), u.id]);
    await run(`DELETE FROM resets WHERE user_id = $1`, [u.id]);
    await run(`DELETE FROM tokens WHERE user_id = $1`, [u.id]);
    return ok();
  },

  async config() {
    const methods = (await run(`SELECT id, name, currency, icon, info, instructions, min_amount, max_amount, expiry_minutes FROM payment_methods WHERE active = 1 ORDER BY id`))
      .map((m) => ({ ...m, id: num(m.id), min_amount: num(m.min_amount), max_amount: num(m.max_amount), expiry_minutes: num(m.expiry_minutes) }));
    return ok({
      maintenance: { on: (await getSet("maint_on")) === "1", message: await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا. نعود قريبًا.") },
      banner: { on: (await getSet("banner_on")) === "1", text: await getSet("banner_text") },
      wallets: methods.map((m) => ({ id: m.id, name: m.name, icon: m.icon, number: m.info })),
      methods, rates: await getRates(),
      update: { version: (await getSet("upd_version")) || env("UPDATE_VERSION"), url: (await getSet("upd_url")) || env("UPDATE_URL"), notes: (await getSet("upd_notes")) || env("UPDATE_NOTES"), force: ((await getSet("upd_force")) || env("UPDATE_FORCE")) === "1" },
    });
  },
  async catalog() {
    const categories = await run(`SELECT id, name, image FROM categories ORDER BY sort, id`);
    const products = await run(`SELECT id, category_id, name, image, price, qty, pack, max_order FROM products WHERE active = 1 ORDER BY id`);
    return ok({ categories, products: products.map((p) => ({ ...p, price: num(p.price), qty: num(p.qty), pack: num(p.pack) || 1, max_order: num(p.max_order) })) });
  },
  async order_create(b) {
    const u = await authUser(b);
    const pid = Number(b.product_id), qty = Math.floor(Number(b.qty));
    if (!(pid > 0) || !(qty >= 1 && qty <= 1000)) throw new Fail("invalid");
    const cur = CURRENCIES.includes(String(b.currency)) ? String(b.currency) : "JOD";
    const p = await first(`SELECT * FROM products WHERE id = $1 AND active = 1`, [pid]);
    if (!p) throw new Fail("not_found", 404);
    if (num(p.max_order) > 0 && qty > num(p.max_order)) throw new Fail("limit_exceeded", 400, { max: num(p.max_order) });
    const total = fromJod(num(p.price) * qty, cur, await getRates());
    const after = await withTx(async (q) => {
      const w = await q(`UPDATE user_wallets SET amount = amount - $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 AND amount >= $1 RETURNING amount`, [total, nowS(), u.id, cur]);
      if (!w.length) throw new Fail("insufficient_balance", 402);
      if (!(await q(`UPDATE products SET qty = qty - $1 WHERE id = $2 AND qty >= $1 RETURNING id`, [qty, pid])).length) throw new Fail("out_of_stock", 409);
      const o = await q(`INSERT INTO orders (user_id, product_id, product_name, qty, total, status, created_at, updated_at, currency) VALUES ($1,$2,$3,$4,$5,'new',$6,$6,$7) RETURNING id`, [u.id, pid, p.name, qty, total, nowS(), cur]);
      const a = num(w[0].amount);
      await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, note, actor, created_at) VALUES ($1,$2,$3,'purchase',$4,$5,$6,$7,$8,$9,$10)`,
        [txid("TX"), "pur:" + o[0].id, u.id, cur, -total, r4(a + total), a, `${p.name} × ${qty}`, "user:" + u.id, nowS()]);
      return a;
    });
    return ok({ balance: after, currency: cur, total });
  },
  async orders(b) {
    const u = await authUser(b);
    return ok({ orders: (await run(`SELECT id, product_name, qty, total, status, created_at, currency FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id])).map((o) => ({ ...o, total: num(o.total), qty: num(o.qty), created_at: num(o.created_at) })) });
  },

  // ----- wallet / deposits -----
  async wallet_overview(b) {
    const u = await authUser(b);
    await expireStale();
    const unread = await count(`SELECT COUNT(*) c FROM notifications WHERE user_id = $1 AND is_read = 0`, [u.id]);
    return ok({ balances: await balancesOf(u.id), rates: await getRates(), unread });
  },
  async deposit_create(b) {
    const u = await authUser(b);
    await expireStale();
    const m = await first(`SELECT * FROM payment_methods WHERE id = $1 AND active = 1`, [Number(b.method_id)]);
    if (!m) throw new Fail("not_found", 404);
    const amount = r4(Number(b.amount));
    if (!(amount > 0) || !Number.isFinite(amount)) throw new Fail("invalid");
    if (amount < num(m.min_amount) || (num(m.max_amount) > 0 && amount > num(m.max_amount))) throw new Fail("out_of_limits", 400, { min: num(m.min_amount), max: num(m.max_amount) });
    const idem = String(b.idem_key ?? "").slice(0, 64) || null;
    if (idem) { const ex = await first(`SELECT * FROM deposit_orders WHERE user_id = $1 AND idem_key = $2`, [u.id, idem]); if (ex) return ok({ order: depOut(ex), duplicate: true }); }
    if ((await count(`SELECT COUNT(*) c FROM deposit_orders WHERE user_id = $1 AND status = 'awaiting_payment'`, [u.id])) >= 5) throw new Fail("too_many", 429);
    if ((await count(`SELECT COUNT(*) c FROM deposit_orders WHERE user_id = $1 AND created_at > $2`, [u.id, nowS() - 3600])) >= 20) throw new Fail("too_many", 429);
    const rt = await getRates();
    const pushes: Push[] = [];
    try {
      const o = await withTx(async (q) => {
        const r = (await q(`INSERT INTO deposit_orders (txn_id, user_id, method_id, method_name, currency, amount, rate_usdt, status, idem_key, created_at, updated_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'awaiting_payment',$8,$9,$9,$10) RETURNING *`,
          [txid("DEP"), u.id, m.id, m.name, m.currency, amount, rt[m.currency] ?? 1, idem, nowS(), nowS() + Math.max(1, num(m.expiry_minutes)) * 60]))[0];
        await q(`INSERT INTO status_history (order_id, from_status, to_status, actor, note, created_at) VALUES ($1,NULL,'awaiting_payment','user:' || $2,'',$3)`, [r.id, String(u.id), nowS()]);
        await audit(q, "user:" + u.id, "create_deposit", "deposit_order", r.txn_id, { amount, currency: m.currency, method: m.name, rate_usdt: rt[m.currency] });
        await notify(q, pushes, r, "created");
        return r;
      });
      await flushPush(pushes);
      return ok({ order: depOut(o) });
    } catch (e) {
      if (isDup(e) && idem) { const ex = await first(`SELECT * FROM deposit_orders WHERE user_id = $1 AND idem_key = $2`, [u.id, idem]); if (ex) return ok({ order: depOut(ex), duplicate: true }); }
      throw e;
    }
  },
  async deposit_proof(b) {
    const u = await authUser(b);
    await expireStale();
    if (!okImg(b.proof)) throw new Fail("invalid");
    const o = await first(`SELECT * FROM deposit_orders WHERE id = $1 AND user_id = $2`, [Number(b.order_id), u.id]);
    if (!o) throw new Fail("not_found", 404);
    if (o.status !== "awaiting_payment") { if (await first(`SELECT 1 FROM payment_proofs WHERE order_id = $1`, [o.id])) return ok({ order: depOut(o), duplicate: true }); throw new Fail("bad_transition", 409, { from: o.status }); }
    const pushes: Push[] = [];
    try {
      const n = await withTx(async (q) => {
        await q(`INSERT INTO payment_proofs (order_id, image, created_at) VALUES ($1,$2,$3)`, [o.id, b.proof, nowS()]);
        const r = await moveTo(q, o, "proof_sent", "user:" + u.id, "رفع إثبات الدفع");
        await audit(q, "user:" + u.id, "upload_proof", "deposit_order", r.txn_id, {});
        await notify(q, pushes, r, "proof_sent");
        return r;
      });
      await flushPush(pushes);
      return ok({ order: depOut(n) });
    } catch (e) {
      if (isDup(e)) return ok({ order: depOut((await first(`SELECT * FROM deposit_orders WHERE id = $1`, [o.id]))!), duplicate: true });
      throw e;
    }
  },
  async deposit_cancel(b) {
    const u = await authUser(b);
    const o = await first(`SELECT * FROM deposit_orders WHERE id = $1 AND user_id = $2`, [Number(b.order_id), u.id]);
    if (!o) throw new Fail("not_found", 404);
    if (o.status === "cancelled") return ok({ order: depOut(o) });
    if (o.status !== "awaiting_payment") throw new Fail("bad_transition", 409, { from: o.status });
    const pushes: Push[] = [];
    const n = await withTx(async (q) => {
      const r = await moveTo(q, o, "cancelled", "user:" + u.id, "إلغاء من المستخدم");
      await audit(q, "user:" + u.id, "cancel_deposit", "deposit_order", r.txn_id, {});
      await notify(q, pushes, r, "cancelled");
      return r;
    });
    await flushPush(pushes);
    return ok({ order: depOut(n) });
  },
  async wallet_history(b) {
    const u = await authUser(b);
    await expireStale();
    const deps = await run(`SELECT * FROM deposit_orders WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id]);
    const txs = await run(`SELECT * FROM transactions WHERE user_id = $1 AND type <> 'deposit' ORDER BY id DESC LIMIT 100`, [u.id]);
    const items = [
      ...deps.map((o) => ({ kind: "deposit", txn_id: o.txn_id, type: "deposit", status: o.status, amount: num(o.credit_amount ?? o.amount), currency: o.currency, title: o.method_name, balance_before: o.balance_before == null ? null : num(o.balance_before), balance_after: o.balance_after == null ? null : num(o.balance_after), reject_reason: o.reject_reason ?? null, created_at: num(o.created_at) })),
      ...txs.map((t) => ({ kind: "txn", txn_id: t.txn_id, type: t.type, status: "done", amount: num(t.amount), currency: t.currency, title: t.note ?? "", balance_before: num(t.balance_before), balance_after: num(t.balance_after), reject_reason: null, created_at: num(t.created_at) })),
    ].sort((x, y) => y.created_at - x.created_at);
    return ok({ items });
  },
  async transaction_get(b) {
    const u = await authUser(b);
    const id = String(b.txn_id ?? "");
    if (id.startsWith("DEP-")) {
      const o = await first(`SELECT * FROM deposit_orders WHERE txn_id = $1 AND user_id = $2`, [id, u.id]);
      if (!o) throw new Fail("not_found", 404);
      const hist = await run(`SELECT from_status, to_status, actor, note, created_at FROM status_history WHERE order_id = $1 ORDER BY id`, [o.id]);
      const proof = await first(`SELECT image FROM payment_proofs WHERE order_id = $1`, [o.id]);
      return ok({ kind: "deposit", order: { ...depOut(o), user_id: num(o.user_id), rate_usdt: num(o.rate_usdt) }, proof: proof?.image ?? null, history: hist.map((h) => ({ ...h, actor: String(h.actor).startsWith("admin:") ? "admin" : String(h.actor).startsWith("user:") ? "user" : "system", created_at: num(h.created_at) })) });
    }
    const t = await first(`SELECT * FROM transactions WHERE txn_id = $1 AND user_id = $2`, [id, u.id]);
    if (!t) throw new Fail("not_found", 404);
    return ok({ kind: "txn", txn: { txn_id: t.txn_id, type: t.type, currency: t.currency, amount: num(t.amount), balance_before: num(t.balance_before), balance_after: num(t.balance_after), ref_txn_id: t.ref_txn_id ?? null, note: t.note ?? "", user_id: num(t.user_id), created_at: num(t.created_at) } });
  },
  // legacy endpoints so older app builds / the web app keep working
  async topup_create(b) {
    const u = await authUser(b);
    const m = await first(`SELECT * FROM payment_methods WHERE id = $1 AND active = 1`, [Number(b.wallet_id)]);
    if (!m) throw new Fail("not_found", 404);
    const amount = r4(Number(b.amount));
    if (!(amount > 0) || !okImg(b.receipt)) throw new Fail("invalid");
    if (amount < num(m.min_amount) || (num(m.max_amount) > 0 && amount > num(m.max_amount))) throw new Fail("out_of_limits", 400, { min: num(m.min_amount), max: num(m.max_amount) });
    if ((await count(`SELECT COUNT(*) c FROM deposit_orders WHERE user_id = $1 AND status IN ('awaiting_payment','proof_sent','under_review','verifying')`, [u.id])) >= 5) throw new Fail("too_many", 429);
    const rt = await getRates(), pushes: Push[] = [];
    await withTx(async (q) => {
      const r = (await q(`INSERT INTO deposit_orders (txn_id, user_id, method_id, method_name, currency, amount, rate_usdt, status, created_at, updated_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'awaiting_payment',$8,$8,$9) RETURNING *`,
        [txid("DEP"), u.id, m.id, m.name, m.currency, amount, rt[m.currency] ?? 1, nowS(), nowS() + 3600]))[0];
      await q(`INSERT INTO status_history (order_id, from_status, to_status, actor, note, created_at) VALUES ($1,NULL,'awaiting_payment','user:' || $2,'',$3)`, [r.id, String(u.id), nowS()]);
      await q(`INSERT INTO payment_proofs (order_id, image, created_at) VALUES ($1,$2,$3)`, [r.id, b.receipt, nowS()]);
      const n = await moveTo(q, r, "proof_sent", "user:" + u.id, "رفع إثبات الدفع");
      await audit(q, "user:" + u.id, "create_deposit", "deposit_order", n.txn_id, { amount, currency: m.currency, legacy: true });
      await notify(q, pushes, n, "proof_sent");
    });
    await flushPush(pushes);
    return ok();
  },
  async topups(b) {
    const u = await authUser(b);
    const map = (st: string) => (st === "credited" || st === "approved" ? "approved" : ["rejected", "cancelled", "expired", "reversed"].includes(st) ? "rejected" : "pending");
    return ok({ topups: (await run(`SELECT * FROM deposit_orders WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id])).map((o) => ({ id: num(o.id), wallet_name: o.method_name, amount: num(o.amount), status: map(o.status), note: o.reject_reason ?? null, created_at: num(o.created_at) })) });
  },

  // ----- notifications -----
  async notifications(b) {
    const u = await authUser(b);
    const rows = await run(`SELECT id, kind, title, body, title_en, body_en, ref, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id]);
    return ok({ items: rows.map((n) => ({ ...n, id: num(n.id), is_read: num(n.is_read), created_at: num(n.created_at) })), unread: await count(`SELECT COUNT(*) c FROM notifications WHERE user_id = $1 AND is_read = 0`, [u.id]) });
  },
  async notif_read(b) {
    const u = await authUser(b);
    if (b.all) await run(`UPDATE notifications SET is_read = 1 WHERE user_id = $1`, [u.id]);
    else await run(`UPDATE notifications SET is_read = 1 WHERE user_id = $1 AND id = $2`, [u.id, Number(b.id)]);
    return ok();
  },
  async notif_poll(b) {
    const u = await authUser(b);
    await expireStale();
    const r = await first(`SELECT COUNT(*) c, MAX(id) m FROM notifications WHERE user_id = $1 AND is_read = 0`, [u.id]);
    const last = r && num(r.m) > 0 ? await first(`SELECT title, body, title_en, body_en FROM notifications WHERE id = $1`, [r.m]) : undefined;
    return ok({ unread: num(r?.c), last_id: num(r?.m), title: last?.title ?? "", body: last?.body ?? "", title_en: last?.title_en ?? "", body_en: last?.body_en ?? "" });
  },
  async support_send(b) {
    const u = await authUser(b);
    const body = String(b.body ?? "").trim();
    if (!body || body.length > 1000) throw new Fail("invalid");
    if ((await count(`SELECT COUNT(*) c FROM messages WHERE user_id = $1 AND sender = 'user' AND created_at > $2`, [u.id, now() - 3600])) >= 20) throw new Fail("too_many", 429);
    await run(`INSERT INTO messages (user_id, sender, body, seen, created_at) VALUES ($1,'user',$2,0,$3)`, [u.id, body, now()]);
    return ok();
  },
  async push_register(b) {
    const u = await authUser(b);
    const pt = String(b.push_token ?? "");
    if (!/^Expo(nent)?PushToken\[[\w-]+\]$/.test(pt)) throw new Fail("invalid");
    const tone = TONES.includes(String(b.tone)) ? String(b.tone) : "soft_bell";
    await run(`DELETE FROM push_tokens WHERE token = $1`, [pt]);
    await run(`INSERT INTO push_tokens (token, user_id, updated_at, tone) VALUES ($1,$2,$3,$4)`, [pt, u.id, now(), tone]);
    return ok();
  },
  async support_poll(b) {
    const u = await authUser(b);
    const r = await first(`SELECT COUNT(*) c, MAX(id) m FROM messages WHERE user_id = $1 AND sender = 'admin' AND seen = 0`, [u.id]);
    const last = r && num(r.m) > 0 ? await first(`SELECT body FROM messages WHERE id = $1`, [r.m]) : undefined;
    return ok({ unread: num(r?.c), last_id: num(r?.m), body: String(last?.body ?? "") });
  },
  async support_list(b) {
    const u = await authUser(b);
    const rows = await run(`SELECT id, sender, body, created_at FROM messages WHERE user_id = $1 ORDER BY id DESC LIMIT 200`, [u.id]);
    await run(`UPDATE messages SET seen = 1 WHERE user_id = $1 AND sender = 'admin'`, [u.id]);
    return ok({ messages: rows.reverse().map((m) => ({ ...m, created_at: num(m.created_at) })) });
  },
};

// ---------- admin panel ----------
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,Tahoma,sans-serif;background:#f4f4f2;color:#111}header{background:#111;color:#fff;padding:14px 18px;display:flex;align-items:center;gap:12px;border-bottom:4px solid #e8a900}header h1{font-size:19px;margin:0;flex:1}header h1 b{color:#e8a900}header form{margin:0}.wrap{max-width:1100px;margin:auto;padding:18px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}.card{background:#fff;border-radius:16px;padding:16px;border:1px solid #e5e5e0}.card small{color:#777;display:block;margin-bottom:6px}.card b{font-size:28px}.box{background:#fff;border:1px solid #e5e5e0;border-radius:16px;padding:16px;margin-bottom:18px;overflow-x:auto}h2{font-size:17px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:start;padding:9px 8px;border-bottom:1px solid #eee;vertical-align:middle}th{color:#777;font-weight:600}.av{width:38px;height:38px;border-radius:50%;background:#111;color:#fff;display:inline-grid;place-items:center;font-weight:700;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}input[type=text],input[type=password]{padding:10px 12px;border:1.5px solid #ddd;border-radius:12px;font-size:15px;width:100%}button{font:inherit;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;background:#111;color:#fff}button.g{background:#eee;color:#111}button.r{background:#c62828}button.y{background:#e8a900;color:#111}.tag{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;background:#e6f4e6;color:#1b6b1b}.tag.b{background:#fde8e8;color:#b71c1c}.acts{display:flex;gap:6px;flex-wrap:wrap}.acts form{margin:0}.msg{background:#fff7d6;border:1px solid #e8c500;border-radius:12px;padding:12px;margin-bottom:14px}.err{background:#fde8e8;border:1px solid #e57373;color:#b71c1c;border-radius:12px;padding:12px;margin-bottom:14px}.bars{display:flex;align-items:flex-end;gap:6px;height:120px}.bars div{flex:1;background:#e8a900;border-radius:6px 6px 0 0;min-height:3px;position:relative}.bars span{position:absolute;top:-18px;left:0;right:0;text-align:center;font-size:11px}.lbl{display:flex;gap:6px;font-size:10px;color:#777}.lbl span{flex:1;text-align:center}.login{max-width:360px;margin:12vh auto;background:#fff;padding:24px;border-radius:20px;border:1px solid #e5e5e0}.login label{display:block;font-weight:700;margin:12px 0 6px}.pg{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}.pg a{padding:6px 12px;background:#eee;border-radius:10px;text-decoration:none;color:#111}.pg a.on{background:#111;color:#fff}nav.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}nav.tabs a{padding:8px 14px;background:#fff;border:1px solid #e5e5e0;border-radius:12px;text-decoration:none;color:#111;font-size:14px}nav.tabs a.on{background:#111;color:#fff}nav.tabs i{font-style:normal;background:#c62828;color:#fff;border-radius:10px;padding:0 7px;margin-inline-start:6px;font-size:12px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row input[type=text],.row input[type=number],.row select,textarea{padding:9px 10px;border:1.5px solid #ddd;border-radius:10px;font:inherit}textarea{width:100%;min-height:70px}.th{width:56px;height:56px;border-radius:12px;object-fit:cover;background:#eee}.rc{max-width:220px;max-height:260px;border-radius:12px;border:1px solid #ddd}.chat{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto;margin-bottom:12px}.b{padding:8px 12px;border-radius:14px;max-width:80%;white-space:pre-wrap}.b.u{background:#eee;align-self:flex-start}.b.a{background:#111;color:#fff;align-self:flex-end}.st{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;background:#eee}.st.pending,.st.new{background:#fff3cd}.st.approved,.st.done{background:#e6f4e6;color:#1b6b1b}.st.rejected,.st.cancelled{background:#fde8e8;color:#b71c1c}`;
const html = (title: string, body: string, headers: Row = {}) =>
  new Response(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${h(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; connect-src 'self'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'", ...headers },
  });
const redirect = (to: string, headers: Row = {}) => new Response(null, { status: 303, headers: { Location: to, ...headers } });

const cookieOf = (req: Request, n: string) => (req.headers.get("cookie") ?? "").split(/;\s*/).map((c) => c.split("=")).find((c) => c[0] === n)?.[1];
const sessionCookie = (v: string, maxAge: number) => `hdadmin=${v}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
function sessionValid(req: Request) {
  const v = cookieOf(req, "hdadmin");
  if (!v) return null;
  const [exp, nonce, sig] = v.split(".");
  if (!exp || !nonce || !sig || Number(exp) < now() || !safeEq(sig, hmac(SECRET, `${exp}.${nonce}`))) return null;
  return nonce;
}
const csrfOf = (nonce: string) => hmac(SECRET, "csrf:" + nonce);
const fails = new Map<string, { n: number; until: number }>();

async function admin(req: Request): Promise<Response> {
  if (!SECRET || !ADMIN_USER || ADMIN_PASSWORD.length < 8) {
    return html("لوحة التحكم", `<div class="login"><h2>لوحة التحكم غير مفعّلة</h2><p>اضبط المتغيرات <code>APP_SECRET</code> و<code>ADMIN_USER</code> و<code>ADMIN_PASSWORD</code> (8 أحرف على الأقل) في Railway.</p></div>`);
  }
  const url = new URL(req.url);
  const post = req.method === "POST";
  const form = post ? await req.formData() : new FormData();
  const f = (k: string) => String(form.get(k) ?? "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "x";

  if (post && f("do") === "login") {
    const st = fails.get(ip) ?? { n: 0, until: 0 };
    if (st.n >= 5 && now() < st.until) return html("دخول", loginForm("محاولات كثيرة. انتظر دقيقة."));
    const good = (safeEq(sha(ADMIN_USER), sha(f("u"))) || safeEq(sha(ADMIN_EMAIL), sha(f("u").trim().toLowerCase()))) && safeEq(sha(ADMIN_PASSWORD), sha(f("p")));
    if (!good) {
      await Bun.sleep(1000);
      fails.set(ip, { n: st.n + 1, until: now() + 60 });
      return html("دخول", loginForm("بيانات الدخول غير صحيحة."));
    }
    fails.delete(ip);
    const exp = now() + 8 * 3600, nonce = rnd(12);
    return redirect("/admin", { "Set-Cookie": sessionCookie(`${exp}.${nonce}.${hmac(SECRET, `${exp}.${nonce}`)}`, 8 * 3600) });
  }
  const nonce = sessionValid(req);
  if (!nonce) return html("دخول لوحة التحكم", loginForm(""));
  const csrf = csrfOf(nonce);
  let flash = "";

  if (post) {
    if (!safeEq(csrf, f("csrf"))) return new Response("CSRF", { status: 403 });
    const act = f("do"), id = Number(f("id"));
    if (act === "logout") return redirect("/admin", { "Set-Cookie": sessionCookie("", 0) });
    { const fl = await adminAct(act, f); if (fl) flash = fl; }
    const t = id > 0 ? await first(`SELECT * FROM users WHERE id = $1`, [id]) : undefined;
    if (t) {
      if (["ban", "unban", "unlock", "noavatar", "resetpw", "delete"].includes(act)) await audit(run, ADMIN_ACTOR, "user_" + act, "user", id, { username: t.username });
      if (act === "ban") { await run(`UPDATE users SET status = 'banned' WHERE id = $1`, [id]); await run(`DELETE FROM tokens WHERE user_id = $1`, [id]); flash = `تم حظر ${t.username}`; }
      else if (act === "unban") { await run(`UPDATE users SET status = 'active' WHERE id = $1`, [id]); flash = `تم رفع الحظر عن ${t.username}`; }
      else if (act === "unlock") { await run(`UPDATE users SET failed = 0, locked_until = 0 WHERE id = $1`, [id]); flash = `تم فتح قفل ${t.username}`; }
      else if (act === "noavatar") { await run(`UPDATE users SET avatar = NULL WHERE id = $1`, [id]); flash = `تم حذف صورة ${t.username}`; }
      else if (act === "resetpw") {
        const tmp = rnd(5);
        await run(`UPDATE users SET password_hash = $1, failed = 0, locked_until = 0 WHERE id = $2`, [await Bun.password.hash(tmp), id]);
        await run(`DELETE FROM tokens WHERE user_id = $1`, [id]);
        flash = `كلمة مرور مؤقتة لـ ${t.username} (تظهر مرة واحدة): ${tmp}`;
      } else if (act === "delete") {
        for (const q of [`DELETE FROM tokens WHERE user_id = $1`, `DELETE FROM resets WHERE user_id = $1`, `DELETE FROM users WHERE id = $1`]) await run(q, [id]);
        flash = `تم حذف ${t.username}`;
      }
    }
  }

  const tab = url.searchParams.get("tab") ?? "users";
  if (tab !== "users") return html("لوحة التحكم", await adminShell(tab, csrf, flash, url));
  const t0 = now(), midnight = Math.floor(t0 / 86400) * 86400;
  const total = await count(`SELECT COUNT(*) c FROM users`);
  const today = await count(`SELECT COUNT(*) c FROM users WHERE created_at >= $1`, [midnight]);
  const week = await count(`SELECT COUNT(*) c FROM users WHERE created_at >= $1`, [t0 - 7 * 86400]);
  const banned = await count(`SELECT COUNT(*) c FROM users WHERE status = 'banned'`);
  const online = await count(`SELECT COUNT(*) c FROM users WHERE last_login >= $1`, [t0 - 86400]);
  const withAv = await count(`SELECT COUNT(*) c FROM users WHERE avatar IS NOT NULL`);
  const days: [string, number][] = [];
  for (let i = 13; i >= 0; i--) {
    const from = midnight - i * 86400, d = new Date(from * 1000);
    days.push([`${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`, await count(`SELECT COUNT(*) c FROM users WHERE created_at >= $1 AND created_at < $2`, [from, from + 86400])]);
  }
  const max = Math.max(1, ...days.map((d) => d[1]));
  const q = (url.searchParams.get("q") ?? "").trim(), pageNo = Math.max(1, Number(url.searchParams.get("pg")) || 1), per = 20;
  const like = `%${q.toLowerCase()}%`;
  const where = q ? `WHERE username_lc LIKE $1 OR email LIKE $1` : "";
  const matches = await count(`SELECT COUNT(*) c FROM users ${where}`, q ? [like] : []);
  const pages = Math.max(1, Math.ceil(matches / per));
  const rows = await run(`SELECT id, username, email, avatar, status, failed, locked_until, last_login, created_at FROM users ${where} ORDER BY id DESC LIMIT ${per} OFFSET ${(pageNo - 1) * per}`, q ? [like] : []);

  const fmt = (t: any) => (num(t) ? new Date(num(t) * 1000).toISOString().slice(0, 16).replace("T", " ") : "—");
  const btn = (act: string, id: any, label: string, cls = "g", confirmMsg = "") =>
    `<form method="post"${confirmMsg ? ` onsubmit="return confirm('${h(confirmMsg)}')"` : ""}><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="do" value="${act}"><input type="hidden" name="id" value="${id}"><button class="${cls}">${label}</button></form>`;

  let out = `<header><h1>HD <b>Market</b> · لوحة التحكم</h1><form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="do" value="logout"><button class="g">خروج</button></form></header><div class="wrap">${await adminNav("users")}`;
  if (flash) out += `<div class="msg">${h(flash)}</div>`;
  const card = (l: string, v: number) => `<div class="card"><small>${l}</small><b>${v}</b></div>`;
  out += `<div class="cards">${card("إجمالي المستخدمين", total)}${card("سجّلوا اليوم", today)}${card("آخر 7 أيام", week)}${card("دخلوا خلال 24 ساعة", online)}${card("لديهم صورة", withAv)}${card("محظورون", banned)}</div>`;
  out += `<div class="box"><h2>التسجيلات آخر 14 يومًا</h2><div class="bars" dir="ltr">${days.map(([, n]) => `<div style="height:${Math.max(3, Math.round((n / max) * 100))}%"><span>${n}</span></div>`).join("")}</div><div class="lbl" dir="ltr">${days.map(([d]) => `<span>${d}</span>`).join("")}</div></div>`;
  out += `<div class="box"><h2>المستخدمون (${matches})</h2><form method="get" style="display:flex;gap:8px;margin-bottom:12px"><input type="text" name="q" value="${h(q)}" placeholder="بحث بالاسم أو البريد"><button>بحث</button></form><table><tr><th></th><th>الاسم</th><th>البريد</th><th>الأرصدة</th><th>الحالة</th><th>تسجيل</th><th>آخر دخول</th><th>إجراءات</th></tr>`;
  const wl: Record<string, Row> = {};
  if (rows.length) for (const w of await run(`SELECT user_id, currency, amount FROM user_wallets WHERE user_id IN (${rows.map((r) => Number(r.id)).join(",")})`)) (wl[w.user_id] ??= {})[w.currency] = num(w.amount);
  for (const r of rows) {
    const locked = num(r.locked_until) > t0, banned = r.status === "banned";
    const av = r.avatar ? `<img src="${h(r.avatar)}" alt="">` : h([...String(r.username)][0]?.toUpperCase());
    const st = banned ? `<span class="tag b">محظور</span>` : locked ? `<span class="tag b">مقفل مؤقتًا</span>` : `<span class="tag">نشط</span>`;
    const acts = (banned ? btn("unban", r.id, "رفع الحظر", "y") : btn("ban", r.id, "حظر", "g", "حظر هذا المستخدم؟")) +
      (locked || num(r.failed) > 0 ? btn("unlock", r.id, "فتح القفل") : "") + btn("resetpw", r.id, "كلمة مرور مؤقتة", "g", "إنشاء كلمة مرور مؤقتة وتسجيل خروجه؟") +
      (r.avatar ? btn("noavatar", r.id, "حذف الصورة") : "") + btn("delete", r.id, "حذف", "r", "حذف الحساب نهائيًا؟");
    out += `<tr><td><span class="av">${av}</span></td><td>${h(r.username)}</td><td dir="ltr" style="text-align:start">${h(r.email)}</td><td dir="ltr" style="text-align:start;font-size:12px">${CURRENCIES.map((c) => `${c} ${num(wl[r.id]?.[c])}`).join("<br>")}</td><td>${st}</td><td>${fmt(r.created_at)}</td><td>${fmt(r.last_login)}</td><td><div class="acts">${acts}</div></td></tr>`;
  }
  if (!rows.length) out += `<tr><td colspan="8" style="text-align:center;color:#777;padding:24px">لا يوجد مستخدمون.</td></tr>`;
  out += `</table><div class="pg">${Array.from({ length: Math.min(pages, 30) }, (_, i) => `<a class="${i + 1 === pageNo ? "on" : ""}" href="?pg=${i + 1}${q ? "&q=" + encodeURIComponent(q) : ""}">${i + 1}</a>`).join("")}</div></div></div>`;
  return html("لوحة التحكم", out);
}
// ---------- admin: extra sections ----------
const TABS: [string, string][] = [["users", "المستخدمون"], ["orders", "الطلبات"], ["deposits", "طلبات الشحن"], ["categories", "الأقسام"], ["products", "المنتجات"], ["methods", "طرق الدفع"], ["rates", "أسعار الصرف"], ["ledger", "السجل المالي"], ["support", "الدعم"], ["settings", "الصيانة والتحديث"]];
async function adminNav(cur: string) {
  const badge: Record<string, number> = {
    orders: await count(`SELECT COUNT(*) c FROM orders WHERE status = 'new'`),
    deposits: await count(`SELECT COUNT(*) c FROM deposit_orders WHERE status IN ('proof_sent','amount_mismatch')`),
    support: await count(`SELECT COUNT(*) c FROM messages WHERE sender = 'user' AND seen = 0`),
  };
  return `<nav class="tabs">${TABS.map(([k, l]) => `<a class="${k === cur ? "on" : ""}" href="/admin?tab=${k}">${l}${badge[k] ? `<i>${badge[k]}</i>` : ""}</a>`).join("")}</nav>`;
}
const PICK_JS = `<script>document.addEventListener("change",function(e){var i=e.target;if(!i.classList||!i.classList.contains("pick")||!i.files[0])return;var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var m=700,k=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);var d=c.toDataURL("image/jpeg",0.8);i.parentNode.querySelector("input[name=image]").value=d;var pv=i.parentNode.querySelector("img.th");if(pv)pv.src=d;};im.src=r.result;};r.readAsDataURL(i.files[0]);});document.addEventListener("click",function(e){var b=e.target;if(b.dataset&&b.dataset.copy){navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy);b.textContent="تم النسخ";}});</script>`;
const LIVE_JS = `<script>(function(){function near(el){return el.scrollHeight-el.scrollTop-el.clientHeight<80}setInterval(async function(){if(document.hidden)return;try{var r=await fetch(location.href,{credentials:"same-origin"});if(!r.ok)return;var d=new DOMParser().parseFromString(await r.text(),"text/html");var a=document.getElementById("thr"),b=d.getElementById("thr");if(a&&b&&a.innerHTML!==b.innerHTML)a.innerHTML=b.innerHTML;var c=document.getElementById("chat"),e=d.getElementById("chat");if(c&&e&&c.innerHTML!==e.innerHTML){var s=near(c);c.innerHTML=e.innerHTML;if(s)c.scrollTop=c.scrollHeight}var n1=document.querySelector("nav.tabs"),n2=d.querySelector("nav.tabs");if(n1&&n2&&n1.innerHTML!==n2.innerHTML)n1.innerHTML=n2.innerHTML}catch(x){}},5000);var c=document.getElementById("chat");if(c)c.scrollTop=c.scrollHeight})()</script>`;
const picker = (cur: any) => `<span class="row"><img class="th" ${cur ? `src="${h(cur)}"` : 'style="visibility:hidden"'} alt=""><input type="hidden" name="image" value=""><input class="pick" type="file" accept="image/*"></span>`;
const fmtT = (t: any) => (num(t) ? new Date(num(t) * 1000).toISOString().slice(0, 16).replace("T", " ") : "—");

async function adminAct(act: string, f: (k: string) => string): Promise<string> {
  const id = Number(f("id")), t = now();
  const img = f("image");
  if (img && !okImg(img)) return "الصورة غير صالحة (jpeg/png/webp وحجم أصغر).";
  if (["cat_save", "cat_del", "prod_save", "prod_del", "set_save", "support_reply"].includes(act)) {
    const det: Row = {}; for (const k of ["id", "name", "sort", "category_id", "price", "qty", "pack", "max_order", "active", "uid", "maint_on", "banner_on", "upd_version", "upd_url", "upd_force"]) if (f(k) !== "") det[k] = f(k);
    await audit(run, ADMIN_ACTOR, act, "admin", id || "", det);
  }
  switch (act) {
    case "cat_save": {
      const name = f("name").trim().slice(0, 60); if (!name) return "اسم القسم مطلوب";
      if (id > 0) { await run(`UPDATE categories SET name = $1, sort = $2 WHERE id = $3`, [name, Number(f("sort")) || 0, id]); if (img) await run(`UPDATE categories SET image = $1 WHERE id = $2`, [img, id]); }
      else await run(`INSERT INTO categories (name, image, sort, created_at) VALUES ($1,$2,$3,$4)`, [name, img || null, Number(f("sort")) || 0, t]);
      return "تم حفظ القسم";
    }
    case "cat_del": await run(`DELETE FROM products WHERE category_id = $1`, [id]); await run(`DELETE FROM categories WHERE id = $1`, [id]); return "تم حذف القسم ومنتجاته";
    case "prod_save": {
      const name = f("name").trim().slice(0, 100), cat = Number(f("category_id")), price = Math.max(0, Number(f("price")) || 0), qty = Math.max(0, Math.floor(Number(f("qty")) || 0)), active = f("active") === "1" ? 1 : 0, pack = Math.max(1, Math.floor(Number(f("pack")) || 1)), maxo = Math.max(0, Math.floor(Number(f("max_order")) || 0));
      if (!name || !(cat > 0)) return "الاسم والقسم مطلوبان";
      if (id > 0) { await run(`UPDATE products SET name=$1, category_id=$2, price=$3, qty=$4, active=$5, pack=$7, max_order=$8 WHERE id=$6`, [name, cat, price, qty, active, id, pack, maxo]); if (img) await run(`UPDATE products SET image = $1 WHERE id = $2`, [img, id]); }
      else await run(`INSERT INTO products (category_id, name, image, price, qty, active, created_at, pack, max_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [cat, name, img || null, price, qty, active, t, pack, maxo]);
      return "تم حفظ المنتج";
    }
    case "prod_del": await run(`DELETE FROM products WHERE id = $1`, [id]); return "تم حذف المنتج";
    case "method_save": {
      const name = f("name").trim().slice(0, 60), info = f("info").trim().slice(0, 300), cur = f("currency");
      if (!name || !info || !CURRENCIES.includes(cur)) return "الاسم والعملة ومعلومات الدفع مطلوبة";
      const minA = Math.max(0, r4(Number(f("min_amount")) || 0)), maxA = Math.max(0, r4(Number(f("max_amount")) || 0));
      if (maxA > 0 && maxA < minA) return "الحد الأقصى أقل من الحد الأدنى";
      const exp = Math.min(10080, Math.max(1, Math.floor(Number(f("expiry_minutes")) || 60))), active = f("active") === "1" ? 1 : 0, ins = f("instructions").trim().slice(0, 600);
      if (id > 0) {
        await run(`UPDATE payment_methods SET name=$1, currency=$2, info=$3, instructions=$4, min_amount=$5, max_amount=$6, expiry_minutes=$7, active=$8, updated_at=$9 WHERE id=$10`, [name, cur, info, ins, minA, maxA, exp, active, t, id]);
        if (img) await run(`UPDATE payment_methods SET icon = $1 WHERE id = $2`, [img, id]);
        await audit(run, ADMIN_ACTOR, "update_payment_method", "payment_method", id, { name, currency: cur, info, min: minA, max: maxA, expiry: exp, active });
      } else {
        const r = await run(`INSERT INTO payment_methods (name, currency, icon, info, instructions, min_amount, max_amount, expiry_minutes, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`, [name, cur, img || null, info, ins, minA, maxA, exp, active, t]);
        await audit(run, ADMIN_ACTOR, "create_payment_method", "payment_method", r[0].id, { name, currency: cur, info, min: minA, max: maxA, expiry: exp, active });
      }
      return "تم حفظ طريقة الدفع";
    }
    case "method_toggle": {
      const m = await first(`SELECT active FROM payment_methods WHERE id = $1`, [id]); if (!m) return "غير موجودة";
      const na = num(m.active) ? 0 : 1;
      await run(`UPDATE payment_methods SET active = $1, updated_at = $2 WHERE id = $3`, [na, t, id]);
      await audit(run, ADMIN_ACTOR, na ? "enable_payment_method" : "disable_payment_method", "payment_method", id, {});
      return na ? "تم تفعيل الطريقة" : "تم تعطيل الطريقة";
    }
    case "method_del": {
      if (await count(`SELECT COUNT(*) c FROM deposit_orders WHERE method_id = $1`, [id]) > 0) {
        await run(`UPDATE payment_methods SET active = 0, updated_at = $1 WHERE id = $2`, [t, id]);
        await audit(run, ADMIN_ACTOR, "disable_payment_method", "payment_method", id, { reason: "has_financial_records" });
        return "الطريقة مرتبطة بعمليات مالية سابقة، لذلك تم تعطيلها بدل حذفها";
      }
      await run(`DELETE FROM payment_methods WHERE id = $1`, [id]);
      await audit(run, ADMIN_ACTOR, "delete_payment_method", "payment_method", id, {});
      return "تم حذف طريقة الدفع";
    }
    case "rate_save": {
      const old = await getRates(), out: string[] = [];
      for (const c of ["JOD", "IQD"]) {
        const v = Number(f("rate_" + c));
        if (!(v > 0) || !Number.isFinite(v)) return "أدخل سعر صرف صحيحًا لكل عملة";
        if (Math.abs(v - (old[c] ?? 0)) > 1e-9) {
          await run(`UPDATE exchange_rates SET per_usdt = $1, updated_at = $2, updated_by = $3 WHERE currency = $4`, [v, t, ADMIN_ACTOR, c]);
          await run(`INSERT INTO exchange_rate_history (currency, old_rate, new_rate, actor, created_at) VALUES ($1,$2,$3,$4,$5)`, [c, old[c] ?? null, v, ADMIN_ACTOR, t]);
          await audit(run, ADMIN_ACTOR, "update_exchange_rate", "exchange_rate", c, { old: old[c], new: v });
          out.push(c);
        }
      }
      return out.length ? "تم تحديث أسعار الصرف" : "لا تغييرات";
    }
    case "dep_move": case "dep_mismatch": case "dep_reject": case "dep_approve": case "dep_reverse": case "dep_cancel": {
      const o = await first(`SELECT * FROM deposit_orders WHERE id = $1`, [id]);
      if (!o) return "الطلب غير موجود";
      const note = f("note").trim().slice(0, 300), pushes: Push[] = [];
      try {
        await withTx(async (q) => {
          if (act === "dep_move") {
            const to = f("to");
            if (!["under_review", "verifying"].includes(to)) throw new Fail("bad_transition", 409);
            const n = await moveTo(q, o, to, ADMIN_ACTOR, note, { admin_actor: ADMIN_ACTOR });
            await audit(q, ADMIN_ACTOR, "change_status", "deposit_order", n.txn_id, { from: o.status, to });
            await notify(q, pushes, n, to);
          } else if (act === "dep_mismatch") {
            const paid = r4(Number(f("paid")));
            if (!(paid > 0) || Math.abs(paid - num(o.amount)) < 1e-9) throw new Fail("invalid");
            const n = await moveTo(q, o, "amount_mismatch", ADMIN_ACTOR, `المدفوع ${paid} مقابل المطلوب ${num(o.amount)}`, { paid_amount: paid, admin_actor: ADMIN_ACTOR });
            await audit(q, ADMIN_ACTOR, "amount_mismatch", "deposit_order", n.txn_id, { requested: num(o.amount), paid, diff: r4(paid - num(o.amount)) });
            await notify(q, pushes, n, "amount_mismatch");
          } else if (act === "dep_reject") {
            if (!note) throw new Fail("reason_required");
            const n = await moveTo(q, o, "rejected", ADMIN_ACTOR, note, { reject_reason: note, admin_actor: ADMIN_ACTOR });
            await audit(q, ADMIN_ACTOR, "reject_deposit", "deposit_order", n.txn_id, { reason: note });
            await notify(q, pushes, n, "rejected", { r: note });
          } else if (act === "dep_cancel") {
            const n = await moveTo(q, o, "cancelled", ADMIN_ACTOR, note || "إلغاء من المسؤول", { admin_actor: ADMIN_ACTOR });
            await audit(q, ADMIN_ACTOR, "cancel_deposit", "deposit_order", n.txn_id, { note });
            await notify(q, pushes, n, "cancelled");
          } else if (act === "dep_approve") {
            const usePaid = f("use") === "paid" && o.status === "amount_mismatch" && o.paid_amount != null;
            await audit(q, ADMIN_ACTOR, "approve_deposit", "deposit_order", o.txn_id, { use: usePaid ? "paid" : "requested" });
            await creditOrder(q, pushes, o, ADMIN_ACTOR, usePaid ? num(o.paid_amount) : num(o.amount), note);
          } else {
            if (!note) throw new Fail("reason_required");
            await reverseOrder(q, pushes, o, ADMIN_ACTOR, note);
          }
        });
      } catch (e) {
        if (e instanceof Fail) return ({ bad_transition: "لا يمكن هذا الانتقال من الحالة الحالية (ربما تمت معالجته)", duplicate: "تمت معالجة هذه العملية مسبقًا", reason_required: "السبب مطلوب", invalid: "قيمة غير صالحة", insufficient_for_reversal: "رصيد المستخدم الحالي لا يكفي لعكس العملية" } as Record<string, string>)[e.code] ?? "تعذّر تنفيذ العملية";
        throw e;
      }
      await flushPush(pushes);
      return "تم تنفيذ الإجراء";
    }
    case "order_status": {
      const st = f("status");
      if (!ORDER_STATUS[st]) return "حالة غير صالحة";
      if (st === "cancelled") {
        try {
          await withTx(async (q) => {
            const r = await q(`UPDATE orders SET status='cancelled', updated_at=$1 WHERE id=$2 AND status IN ('new','processing') RETURNING user_id, total, product_id, qty, currency`, [t, id]);
            if (!r.length) throw new Fail("no");
            const cur = r[0].currency, tot = num(r[0].total);
            await q(`INSERT INTO user_wallets (user_id, currency, amount, updated_at) VALUES ($1,$2,0,$3) ON CONFLICT (user_id, currency) DO NOTHING`, [r[0].user_id, cur, t]);
            const w = await q(`UPDATE user_wallets SET amount = amount + $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 RETURNING amount`, [tot, t, r[0].user_id, cur]);
            const a = num(w[0].amount);
            await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, note, actor, created_at) VALUES ($1,$2,$3,'refund',$4,$5,$6,$7,$8,$9,$10)`, [txid("TX"), "ref:" + id, r[0].user_id, cur, tot, r4(a - tot), a, `إلغاء الطلب #${id}`, ADMIN_ACTOR, t]);
            await q(`UPDATE products SET qty = qty + $1 WHERE id = $2`, [num(r[0].qty), r[0].product_id]);
            await audit(q, ADMIN_ACTOR, "cancel_order_refund", "order", id, { amount: tot, currency: cur });
          });
        } catch (e) { if (e instanceof Fail || isDup(e)) return "لا يمكن إلغاء هذا الطلب"; throw e; }
        return "تم إلغاء الطلب وإرجاع المبلغ للمستخدم";
      }
      await run(`UPDATE orders SET status=$1, updated_at=$2 WHERE id=$3 AND status <> 'cancelled'`, [st, t, id]);
      await audit(run, ADMIN_ACTOR, "order_status", "order", id, { status: st });
      return "تم تحديث حالة الطلب";
    }
    case "support_reply": {
      const uid = Number(f("uid")), body = f("body").trim().slice(0, 1000);
      if (!(uid > 0) || !body) return "اكتب الرد";
      await run(`INSERT INTO messages (user_id, sender, body, seen, created_at) VALUES ($1,'admin',$2,0,$3)`, [uid, body, t]);
      await run(`UPDATE messages SET seen = 1 WHERE user_id = $1 AND sender = 'user'`, [uid]);
      await sendPush(uid);
      return "تم إرسال الرد";
    }
    case "set_save":
      await putSet("maint_on", f("maint_on") === "1" ? "1" : "0"); await putSet("maint_msg", f("maint_msg").trim().slice(0, 300));
      await putSet("banner_on", f("banner_on") === "1" ? "1" : "0"); await putSet("banner_text", f("banner_text").trim().slice(0, 300));
      await putSet("upd_version", f("upd_version").trim().slice(0, 20)); await putSet("upd_url", f("upd_url").trim().slice(0, 500)); await putSet("upd_notes", f("upd_notes").trim().slice(0, 300)); await putSet("upd_force", f("upd_force") === "1" ? "1" : "0");
      return "تم حفظ الإعدادات";
  }
  return "";
}

async function adminShell(tab: string, csrf: string, flash: string, url: URL): Promise<string> {
  const F = (act: string, inner: string, extra = "") => `<form method="post" action="/admin?tab=${tab}${extra}"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="do" value="${act}">${inner}</form>`;
  const hid = (n: string, v: any) => `<input type="hidden" name="${n}" value="${h(v)}">`;
  let out = `<header><h1>HD <b>Market</b> · لوحة التحكم</h1>${F("logout", `<button class="g">خروج</button>`)}</header><div class="wrap">${await adminNav(tab)}`;
  if (flash) out += `<div class="msg">${h(flash)}</div>`;

  if (tab === "categories") {
    out += `<div class="box"><h2>إضافة قسم</h2>${F("cat_save", `<div class="row"><input type="text" name="name" placeholder="اسم القسم" required><input type="number" name="sort" placeholder="الترتيب" style="width:90px">${picker(null)}<button class="y">إضافة</button></div>`)}</div>`;
    out += `<div class="box"><h2>الأقسام</h2>`;
    for (const c of await run(`SELECT * FROM categories ORDER BY sort, id`)) {
      out += F("cat_save", `${hid("id", c.id)}<div class="row" style="margin-bottom:8px"><input type="text" name="name" value="${h(c.name)}"><input type="number" name="sort" value="${num(c.sort)}" style="width:90px">${picker(c.image)}<button>حفظ</button></div>`) +
        F("cat_del", `${hid("id", c.id)}<button class="r" onclick="return confirm('حذف القسم وكل منتجاته؟')">حذف</button>`) + `<hr style="border:0;border-top:1px solid #eee">`;
    }
    return out + `</div></div>${PICK_JS}`;
  }
  if (tab === "products") {
    const cats = await run(`SELECT id, name FROM categories ORDER BY sort, id`);
    const opts = (sel: any) => cats.map((c) => `<option value="${c.id}"${String(c.id) === String(sel) ? " selected" : ""}>${h(c.name)}</option>`).join("");
    if (!cats.length) return out + `<div class="box">أضف قسمًا أولًا من تبويب «الأقسام».</div></div>`;
    out += `<div class="box"><h2>إضافة عنصر</h2><p style="color:#777;font-size:13px;margin:0 0 10px">الحقول: اسم العنصر · القسم · العدد (قطع في العبوة) · الكمية المتوفرة · الحد المسموح للطلب الواحد (0 = بلا حد) · السعر · الصورة</p>${F("prod_save", `<div class="row"><input type="text" name="name" placeholder="اسم العنصر" required><select name="category_id">${opts("")}</select><input type="number" min="1" name="pack" placeholder="العدد (قطع/عبوة)" title="العدد" style="width:130px" value="1"><input type="number" min="0" name="qty" placeholder="الكمية المتوفرة" title="الكمية" style="width:130px" required><input type="number" min="0" name="max_order" placeholder="الحد المسموح (0=بلا حد)" title="الحد المسموح للطلب الواحد" style="width:170px" value="0"><input type="number" step="0.01" min="0" name="price" placeholder="السعر" style="width:110px" required><label><input type="checkbox" name="active" value="1" checked> ظاهر</label>${picker(null)}<button class="y">إضافة</button></div>`)}</div>`;
    out += `<div class="box"><h2>المنتجات</h2>`;
    for (const p of await run(`SELECT * FROM products ORDER BY id DESC LIMIT 300`)) {
      out += F("prod_save", `${hid("id", p.id)}<div class="row" style="margin-bottom:8px"><input type="text" name="name" value="${h(p.name)}"><select name="category_id">${opts(p.category_id)}</select><input type="number" min="1" name="pack" value="${num(p.pack) || 1}" title="العدد" style="width:90px"><input type="number" min="0" name="qty" value="${num(p.qty)}" title="الكمية" style="width:100px"><input type="number" min="0" name="max_order" value="${num(p.max_order)}" title="الحد المسموح للطلب الواحد (0=بلا حد)" style="width:100px"><input type="number" step="0.01" min="0" name="price" value="${num(p.price)}" title="السعر" style="width:110px"><label><input type="checkbox" name="active" value="1"${num(p.active) ? " checked" : ""}> ظاهر</label>${picker(p.image)}<button>حفظ</button></div>`) +
        F("prod_del", `${hid("id", p.id)}<button class="r" onclick="return confirm('حذف المنتج؟')">حذف</button>`) + `<hr style="border:0;border-top:1px solid #eee">`;
    }
    return out + `</div></div>${PICK_JS}`;
  }
  if (tab === "orders") {
    const sf = url.searchParams.get("st") ?? "";
    out += `<nav class="tabs"><a class="${!sf ? "on" : ""}" href="/admin?tab=orders">الكل</a>${Object.entries(ORDER_STATUS).map(([k, l]) => `<a class="${sf === k ? "on" : ""}" href="/admin?tab=orders&st=${k}">${l}</a>`).join("")}</nav>`;
    const rows = await run(`SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id ${ORDER_STATUS[sf] ? `WHERE o.status = '${sf}'` : ""} ORDER BY o.id DESC LIMIT 200`);
    out += `<div class="box"><h2>الطلبات (${rows.length})</h2><table><tr><th>#</th><th>المستخدم</th><th>المنتج</th><th>العدد</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th><th>تغيير الحالة</th></tr>`;
    for (const o of rows) out += `<tr><td>${o.id}</td><td>${h(o.username ?? "—")}</td><td>${h(o.product_name)}</td><td>${num(o.qty)}</td><td>${num(o.total)}</td><td><span class="st ${h(o.status)}">${h(ORDER_STATUS[o.status] ?? o.status)}</span></td><td>${fmtT(o.created_at)}</td><td>${o.status === "cancelled" ? "—" : F("order_status", `${hid("id", o.id)}<div class="row"><select name="status">${Object.entries(ORDER_STATUS).map(([k, l]) => `<option value="${k}"${k === o.status ? " selected" : ""}>${l}</option>`).join("")}</select><button>حفظ</button></div>`, sf ? `&st=${sf}` : "")}</td></tr>`;
    if (!rows.length) out += `<tr><td colspan="8" style="text-align:center;color:#777;padding:24px">لا توجد طلبات.</td></tr>`;
    return out + `</table></div></div>`;
  }
  if (tab === "deposits") {
    await expireStale();
    const sf = url.searchParams.get("st") ?? "active";
    const ACTIVE = ["proof_sent", "under_review", "verifying", "amount_mismatch", "awaiting_payment"];
    const filters: [string, string][] = [["active", "تحتاج إجراء"], ["credited", STATUS_AR.credited], ["rejected", STATUS_AR.rejected], ["reversed", STATUS_AR.reversed], ["expired", STATUS_AR.expired], ["cancelled", STATUS_AR.cancelled], ["all", "الكل"]];
    out += `<nav class="tabs">${filters.map(([k, l]) => `<a class="${sf === k ? "on" : ""}" href="/admin?tab=deposits&st=${k}">${l}</a>`).join("")}</nav>`;
    const rows = sf === "all" ? await run(`SELECT d.*, u.username FROM deposit_orders d LEFT JOIN users u ON u.id = d.user_id ORDER BY d.id DESC LIMIT 150`)
      : sf === "active" ? await run(`SELECT d.*, u.username FROM deposit_orders d LEFT JOIN users u ON u.id = d.user_id WHERE d.status IN (${ACTIVE.map((x) => `'${x}'`).join(",")}) ORDER BY d.id DESC LIMIT 150`)
      : await run(`SELECT d.*, u.username FROM deposit_orders d LEFT JOIN users u ON u.id = d.user_id WHERE d.status = $1 ORDER BY d.id DESC LIMIT 150`, [filters.some(([k]) => k === sf) ? sf : "credited"]);
    out += `<div class="box"><h2>طلبات الشحن (${rows.length})</h2>`;
    const ex = `&st=${h(sf)}`;
    for (const d of rows) {
      const proof = await first(`SELECT image FROM payment_proofs WHERE order_id = $1`, [d.id]);
      const hist = await run(`SELECT * FROM status_history WHERE order_id = $1 ORDER BY id`, [d.id]);
      const next = FLOW[d.status] ?? [];
      const btns: string[] = [];
      if (next.includes("under_review")) btns.push(F("dep_move", `${hid("id", d.id)}${hid("to", "under_review")}<button class="g">قيد المراجعة</button>`, ex));
      if (next.includes("verifying")) btns.push(F("dep_move", `${hid("id", d.id)}${hid("to", "verifying")}<button class="g">قيد التحقق</button>`, ex));
      if (next.includes("amount_mismatch")) btns.push(F("dep_mismatch", `${hid("id", d.id)}<div class="row"><input type="number" step="any" min="0" name="paid" placeholder="المبلغ المدفوع فعليًا" required style="width:150px"><button class="g">مبلغ غير مطابق</button></div>`, ex));
      if (next.includes("approved")) {
        btns.push(F("dep_approve", `${hid("id", d.id)}${hid("use", "requested")}<button class="y" onclick="return confirm('اعتماد وإضافة ${num(d.amount)} ${h(d.currency)} إلى رصيد المستخدم؟')">${d.status === "amount_mismatch" ? `اعتماد بالمبلغ المطلوب (${num(d.amount)})` : "اعتماد وإضافة الرصيد"}</button>`, ex));
        if (d.status === "amount_mismatch" && d.paid_amount != null) btns.push(F("dep_approve", `${hid("id", d.id)}${hid("use", "paid")}<button class="y" onclick="return confirm('اعتماد وإضافة ${num(d.paid_amount)} ${h(d.currency)} (المدفوع فعليًا)؟')">اعتماد بالمبلغ المدفوع (${num(d.paid_amount)})</button>`, ex));
      }
      if (next.includes("rejected")) btns.push(F("dep_reject", `${hid("id", d.id)}<div class="row"><input type="text" name="note" placeholder="سبب الرفض (مطلوب)" required><button class="r">رفض</button></div>`, ex));
      if (next.includes("cancelled")) btns.push(F("dep_cancel", `${hid("id", d.id)}<button class="g" onclick="return confirm('إلغاء الطلب؟')">إلغاء</button>`, ex));
      if (next.includes("reversed")) btns.push(F("dep_reverse", `${hid("id", d.id)}<div class="row"><input type="text" name="note" placeholder="سبب العكس (مطلوب)" required><button class="r" onclick="return confirm('عكس العملية وخصم ${num(d.credit_amount)} ${h(d.currency)} من رصيد المستخدم؟')">عكس العملية</button></div>`, ex));
      out += `<div class="row" style="align-items:flex-start;border-bottom:1px solid #eee;padding:14px 0">${proof ? `<img class="rc" src="${h(proof.image)}" alt="إثبات">` : `<div class="rc" style="width:120px;height:90px;display:grid;place-items:center;color:#999">لا يوجد إثبات</div>`}
        <div style="flex:1;min-width:230px"><b dir="ltr">${h(d.txn_id)}</b> <span class="st ${h(d.status)}">${h(STATUS_AR[d.status] ?? d.status)}</span><br>
        <b>${h(d.username ?? "—")}</b> (ID ${num(d.user_id)}) · <b dir="ltr">${num(d.amount)} ${h(d.currency)}</b><br>
        <small>الطريقة: ${h(d.method_name)} · سعر الصرف المثبّت: 1 USDT = ${num(d.rate_usdt)} ${h(d.currency)}</small><br>
        <small>أُنشئ: ${fmtT(d.created_at)} · آخر تحديث: ${fmtT(d.updated_at)} · ينتهي: ${fmtT(d.expires_at)}</small>
        ${d.paid_amount != null ? `<br><small style="color:#b71c1c">المطلوب ${num(d.amount)} · المدفوع ${num(d.paid_amount)} · الفرق ${r4(num(d.paid_amount) - num(d.amount))} ${h(d.currency)}</small>` : ""}
        ${d.balance_after != null ? `<br><small>الرصيد قبل: ${num(d.balance_before)} · بعد: ${num(d.balance_after)} · المسؤول: ${h(d.admin_actor ?? "—")}</small>` : ""}
        ${d.reject_reason ? `<br><small>السبب: ${h(d.reject_reason)}</small>` : ""}
        <details style="margin-top:6px"><summary>سجل تغيّر الحالة (${hist.length})</summary>${hist.map((x) => `<div style="font-size:12px;color:#555">${fmtT(x.created_at)} · ${h(STATUS_AR[x.from_status] ?? "—")} ← <b>${h(STATUS_AR[x.to_status] ?? x.to_status)}</b> · ${h(x.actor)}${x.note ? " · " + h(x.note) : ""}</div>`).join("")}</details></div>
        <div class="acts" style="flex-direction:column;align-items:stretch;min-width:240px">${btns.join("")}</div></div>`;
    }
    if (!rows.length) out += `<p style="color:#777">لا توجد طلبات.</p>`;
    return out + `</div></div>`;
  }
  if (tab === "methods") {
    const optc = (sel: string) => CURRENCIES.map((c) => `<option${c === sel ? " selected" : ""}>${c}</option>`).join("");
    const form = (m: Row | null) => F("method_save", `${m ? hid("id", m.id) : ""}<div class="row" style="margin-bottom:6px"><input type="text" name="name" placeholder="اسم الطريقة" value="${h(m?.name ?? "")}" required><select name="currency">${optc(m?.currency ?? "JOD")}</select><input type="number" step="any" min="0" name="min_amount" placeholder="أدنى مبلغ" value="${m ? num(m.min_amount) : ""}" style="width:110px"><input type="number" step="any" min="0" name="max_amount" placeholder="أعلى مبلغ (0=بلا حد)" value="${m ? num(m.max_amount) : ""}" style="width:150px"><input type="number" min="1" name="expiry_minutes" placeholder="مدة الصلاحية (دقيقة)" value="${m ? num(m.expiry_minutes) : 60}" style="width:150px"><label><input type="checkbox" name="active" value="1"${!m || num(m.active) ? " checked" : ""}> مفعّلة</label>${picker(m?.icon ?? null)}</div><div class="row"><input type="text" name="info" dir="ltr" placeholder="معلومات الدفع (رقم/عنوان المحفظة)" value="${h(m?.info ?? "")}" style="flex:1;min-width:240px" required><input type="text" name="instructions" placeholder="تعليمات الدفع" value="${h(m?.instructions ?? "")}" style="flex:1;min-width:240px"><button class="${m ? "" : "y"}">${m ? "حفظ" : "إضافة"}</button></div>`);
    out += `<div class="box"><h2>إضافة طريقة دفع</h2>${form(null)}</div><div class="box"><h2>طرق الدفع</h2>`;
    for (const m of await run(`SELECT * FROM payment_methods ORDER BY id`))
      out += `<div style="margin-bottom:14px">${form(m)}<div class="row">${F("method_toggle", `${hid("id", m.id)}<button class="g">${num(m.active) ? "تعطيل مؤقت" : "تفعيل"}</button>`)}${F("method_del", `${hid("id", m.id)}<button class="r" onclick="return confirm('حذف الطريقة؟ إن كانت مرتبطة بعمليات مالية فسيتم تعطيلها فقط.')">حذف</button>`)}<span class="st ${num(m.active) ? "done" : "cancelled"}">${num(m.active) ? "مفعّلة" : "معطّلة"}</span></div><hr style="border:0;border-top:1px solid #eee"></div>`;
    return out + `</div></div>${PICK_JS}`;
  }
  if (tab === "rates") {
    const rt = await getRates();
    out += `<div class="box"><h2>أسعار الصرف</h2><p style="color:#777;font-size:13px">لا تُحوَّل العملات تلقائيًا إلا بهذه الأسعار (تُستخدم عند الشراء بعملة غير الدينار، والمنتجات مسعّرة بالدينار الأردني). كل طلب شحن يثبّت السعر وقت إنشائه فلا يتغير إن عدّلت السعر لاحقًا. القيم الافتراضية أولية — راجعها قبل الاعتماد.</p>${F("rate_save", `<div class="row"><label>1 USDT = <input type="number" step="any" min="0" name="rate_JOD" value="${rt.JOD}" style="width:120px"> JOD</label><label>1 USDT = <input type="number" step="any" min="0" name="rate_IQD" value="${rt.IQD}" style="width:120px"> IQD</label><button class="y">حفظ الأسعار</button></div>`)}</div>`;
    const hist = await run(`SELECT * FROM exchange_rate_history ORDER BY id DESC LIMIT 100`);
    out += `<div class="box"><h2>سجل تعديل الأسعار</h2><table><tr><th>العملة</th><th>من</th><th>إلى</th><th>المسؤول</th><th>التاريخ</th></tr>${hist.map((x) => `<tr><td>${h(x.currency)}</td><td>${x.old_rate == null ? "—" : num(x.old_rate)}</td><td>${num(x.new_rate)}</td><td>${h(x.actor)}</td><td>${fmtT(x.created_at)}</td></tr>`).join("") || `<tr><td colspan="5" style="color:#777">لا توجد تعديلات بعد.</td></tr>`}</table></div>`;
    return out + `</div>`;
  }
  if (tab === "ledger") {
    const v = url.searchParams.get("v") ?? "tx";
    out += `<nav class="tabs"><a class="${v === "tx" ? "on" : ""}" href="/admin?tab=ledger&v=tx">العمليات المالية</a><a class="${v === "audit" ? "on" : ""}" href="/admin?tab=ledger&v=audit">سجل الإجراءات (Audit)</a></nav>`;
    if (v === "audit") {
      const rows = await run(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300`);
      out += `<div class="box"><h2>سجل الإجراءات (للقراءة فقط · لا يمكن حذفه)</h2><table><tr><th>#</th><th>التاريخ</th><th>المنفّذ</th><th>الإجراء</th><th>الكيان</th><th>تفاصيل</th></tr>${rows.map((x) => `<tr><td>${num(x.id)}</td><td>${fmtT(x.created_at)}</td><td>${h(x.actor)}</td><td>${h(x.action)}</td><td dir="ltr">${h(x.entity)} ${h(x.entity_id)}</td><td dir="ltr" style="font-size:12px;max-width:340px;word-break:break-all">${h(x.details)}</td></tr>`).join("")}</table></div>`;
    } else {
      const rows = await run(`SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 300`);
      out += `<div class="box"><h2>السجل المالي (للقراءة فقط · لا يمكن حذفه)</h2><table><tr><th>Transaction ID</th><th>المستخدم</th><th>النوع</th><th>المبلغ</th><th>قبل</th><th>بعد</th><th>المرجع</th><th>المنفّذ</th><th>التاريخ</th></tr>${rows.map((x) => `<tr><td dir="ltr">${h(x.txn_id)}</td><td>${h(x.username ?? "—")} (${num(x.user_id)})</td><td>${h(x.type)}</td><td dir="ltr" style="color:${num(x.amount) < 0 ? "#b71c1c" : "#1b6b1b"}">${num(x.amount)} ${h(x.currency)}</td><td>${num(x.balance_before)}</td><td>${num(x.balance_after)}</td><td dir="ltr">${h(x.ref_txn_id ?? "")}</td><td>${h(x.actor ?? "")}</td><td>${fmtT(x.created_at)}</td></tr>`).join("")}</table></div>`;
    }
    return out + `</div>`;
  }
  if (tab === "support") {
    const uid = Number(url.searchParams.get("u")) || 0;
    const threads = await run(`SELECT m.user_id, u.username, MAX(m.id) last_id, SUM(CASE WHEN m.sender='user' AND m.seen=0 THEN 1 ELSE 0 END) unread FROM messages m LEFT JOIN users u ON u.id = m.user_id GROUP BY m.user_id, u.username ORDER BY last_id DESC LIMIT 100`);
    out += `<div class="box"><h2>المحادثات</h2><nav class="tabs" id="thr">${threads.map((t) => `<a class="${uid === Number(t.user_id) ? "on" : ""}" href="/admin?tab=support&u=${t.user_id}">${h(t.username ?? "—")}${num(t.unread) ? `<i>${num(t.unread)}</i>` : ""}</a>`).join("") || "لا توجد رسائل بعد."}</nav>`;
    if (uid > 0) {
      await run(`UPDATE messages SET seen = 1 WHERE user_id = $1 AND sender = 'user'`, [uid]);
      const msgs = (await run(`SELECT * FROM messages WHERE user_id = $1 ORDER BY id DESC LIMIT 200`, [uid])).reverse();
      out += `<div class="chat" id="chat">${msgs.map((m) => `<div class="b ${m.sender === "admin" ? "a" : "u"}">${h(m.body)}<br><small style="opacity:.6">${fmtT(m.created_at)}</small></div>`).join("")}</div>${F("support_reply", `${hid("uid", uid)}<textarea name="body" placeholder="اكتب ردك" required></textarea><p><button class="y">إرسال الرد</button></p>`, `&u=${uid}`)}`;
    }
    return out + `</div></div>${LIVE_JS}`;
  }
  if (tab === "settings") {
    const mo = (await getSet("maint_on")) === "1", bo = (await getSet("banner_on")) === "1";
    out += `<div class="box"><h2>وضع الصيانة والشريط الإعلاني</h2>${F("set_save", `
      <p><label><input type="checkbox" name="maint_on" value="1"${mo ? " checked" : ""}> <b>تفعيل وضع الصيانة</b> (يُمنع المستخدمون من استخدام التطبيق ويرون الرسالة أدناه)</label></p>
      <p><textarea name="maint_msg" placeholder="رسالة الصيانة">${h(await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا. نعود قريبًا."))}</textarea></p>
      <hr style="border:0;border-top:1px solid #eee">
      <p><label><input type="checkbox" name="banner_on" value="1"${bo ? " checked" : ""}> <b>إظهار شريط إعلاني</b> في أعلى التطبيق</label></p>
      <p><textarea name="banner_text" placeholder="نص الإعلان">${h(await getSet("banner_text"))}</textarea></p>
      <hr style="border:0;border-top:1px solid #eee">
      <p><b>تحديث التطبيق (أندرويد)</b> — يظهر للمستخدمين شاشة تحميل من 0 إلى 100% ثم يُثبَّت التحديث. اتركه فارغًا لإيقافه.</p>
      <p><input type="text" name="upd_version" placeholder="رقم الإصدار الجديد مثل 3.2.0" dir="ltr" value="${h(await getSet("upd_version"))}"></p>
      <p><input type="text" name="upd_url" placeholder="رابط ملف APK" dir="ltr" value="${h(await getSet("upd_url"))}"></p>
      <p><textarea name="upd_notes" placeholder="ما الجديد في التحديث (اختياري)">${h(await getSet("upd_notes"))}</textarea></p>
      <p><label><input type="checkbox" name="upd_force" value="1"${(await getSet("upd_force")) === "1" ? " checked" : ""}> تحديث إجباري (بلا زر «لاحقًا»)</label></p>
      <button class="y">حفظ</button>`)}</div>`;
    return out + `</div>`;
  }
  return out + `</div>`;
}

const loginForm = (err: string) => `<form class="login" method="post"><h2>HD Market · لوحة التحكم</h2>${err ? `<div class="err">${h(err)}</div>` : ""}<input type="hidden" name="do" value="login"><label>اسم المدير</label><input type="text" name="u" autocomplete="username" required><label>كلمة المرور</label><input type="password" name="p" autocomplete="current-password" required><p><button style="width:100%;padding:12px">دخول</button></p></form>`;

// ---------- server ----------
Bun.serve({
  port: Number(env("PORT", "3000")),
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/health") return json({ ok: true });
      if (path === "/admin") return await admin(req);
      const m = path.match(/^\/api\/(\w+)(?:\.php)?$/);
      if (m) {
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (req.method !== "POST") throw new Fail("invalid", 405);
        if (m[1] !== "config" && (await getSet("maint_on")) === "1") throw new Fail("maintenance", 503, { message: await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا.") });
        const fn = API[m[1]];
        if (!fn) throw new Fail("not_found", 404);
        if (!SECRET) throw new Fail("server_not_configured", 500);
        const raw = await req.text();
        if (raw.length > 600000) throw new Fail("too_big", 413);
        let body: Row = {};
        try { body = JSON.parse(raw || "{}"); } catch {}
        return await fn(body && typeof body === "object" ? body : {});
      }
      if (path === "/") return html("HD Market", `<div class="login"><h2>HD Market API</h2><p>الخادم يعمل. <a href="/admin">لوحة التحكم</a></p></div>`);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      if (e instanceof Fail) return json({ error: e.code, ...e.extra }, e.status);
      console.error(e);
      return json({ error: "server" }, 500);
    }
  },
});
console.log("HD Market server up");

