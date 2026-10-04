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
let run: (q: string, p?: any[]) => Promise<Row[]>;
let isSqlite = false;
if (env("DATABASE_URL")) {
  const sql = postgres(env("DATABASE_URL"), { max: 5, idle_timeout: 20, onnotice: () => {} });
  run = async (q, p = []) => Array.from(await sql.unsafe(q, p as any[]));
} else {
  isSqlite = true;
  const { Database } = await import("bun:sqlite");
  const d = new Database(env("SQLITE_PATH", ":memory:"));
  run = async (q, p = []) => {
    const s = d.query(q.replace(/\$(\d+)/g, "?$1"));
    return /^\s*(select|with)|\breturning\b/i.test(q) ? (s.all(...p) as Row[]) : (s.run(...p), []);
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

const payload = (u: Row) => ({ username: u.username, email: u.email, created: num(u.created_at), avatar: u.avatar ?? null, nameChangedAt: num(u.name_changed_at), balance: num(u.balance) });

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

const TONES = ["soft_bell", "bell", "marimba", "harp", "bubble", "digital", "loud", "calm", "ding", "silent"];
async function sendPush(uid: number) {
  const rows = await run(`SELECT token, tone FROM push_tokens WHERE user_id = $1`, [uid]);
  if (!rows.length) return;
  try {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(rows.map((x) => ({ to: x.token, title: "HD Market", body: "وصل رد جديد من الدعم", data: { screen: "support" }, sound: x.tone === "silent" ? null : `hd_${x.tone}.wav`, channelId: `hd_support_${x.tone}`, priority: "high" }))),
    });
    const j: any = await r.json().catch(() => ({}));
    const list: any[] = Array.isArray(j.data) ? j.data : [];
    for (let i = 0; i < list.length; i++) if (list[i]?.details?.error === "DeviceNotRegistered") await run(`DELETE FROM push_tokens WHERE token = $1`, [rows[i].token]);
  } catch {}
}

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
    return ok({ token: await makeToken(u.id), ...payload(u) });
  },
  async me(b) { return ok(payload(await authUser(b))); },
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
    return ok(payload((await first(`SELECT * FROM users WHERE id = $1`, [u.id]))!));
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
    const wallets = await run(`SELECT id, name, icon, number FROM wallets WHERE active = 1 ORDER BY id`);
    return ok({
      maintenance: { on: (await getSet("maint_on")) === "1", message: await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا. نعود قريبًا.") },
      banner: { on: (await getSet("banner_on")) === "1", text: await getSet("banner_text") },
      wallets,
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
    const p = await first(`SELECT * FROM products WHERE id = $1 AND active = 1`, [pid]);
    if (!p) throw new Fail("not_found", 404);
    if (num(p.max_order) > 0 && qty > num(p.max_order)) throw new Fail("limit_exceeded", 400, { max: num(p.max_order) });
    const total = Math.round(num(p.price) * qty * 100) / 100;
    if (!(await run(`UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING id`, [total, u.id])).length) throw new Fail("insufficient_balance", 402);
    if (!(await run(`UPDATE products SET qty = qty - $1 WHERE id = $2 AND qty >= $1 RETURNING id`, [qty, pid])).length) {
      await run(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [total, u.id]);
      throw new Fail("out_of_stock", 409);
    }
    await run(`INSERT INTO orders (user_id, product_id, product_name, qty, total, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,'new',$6,$6)`, [u.id, pid, p.name, qty, total, now()]);
    return ok({ balance: num((await first(`SELECT balance FROM users WHERE id = $1`, [u.id]))?.balance) });
  },
  async orders(b) {
    const u = await authUser(b);
    return ok({ orders: (await run(`SELECT id, product_name, qty, total, status, created_at FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id])).map((o) => ({ ...o, total: num(o.total), qty: num(o.qty), created_at: num(o.created_at) })) });
  },
  async topup_create(b) {
    const u = await authUser(b);
    const amount = Math.round(Number(b.amount) * 100) / 100, wid = Number(b.wallet_id);
    if (!(amount > 0 && amount <= 10000000) || !okImg(b.receipt)) throw new Fail("invalid");
    const w = await first(`SELECT * FROM wallets WHERE id = $1 AND active = 1`, [wid]);
    if (!w) throw new Fail("not_found", 404);
    if ((await count(`SELECT COUNT(*) c FROM topups WHERE user_id = $1 AND status = 'pending'`, [u.id])) >= 5) throw new Fail("too_many", 429);
    await run(`INSERT INTO topups (user_id, wallet_id, wallet_name, amount, receipt, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,'pending',$6,$6)`, [u.id, wid, w.name, amount, b.receipt, now()]);
    return ok();
  },
  async topups(b) {
    const u = await authUser(b);
    return ok({ topups: (await run(`SELECT id, wallet_name, amount, status, note, created_at FROM topups WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id])).map((t) => ({ ...t, amount: num(t.amount), created_at: num(t.created_at) })) });
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
  out += `<div class="box"><h2>المستخدمون (${matches})</h2><form method="get" style="display:flex;gap:8px;margin-bottom:12px"><input type="text" name="q" value="${h(q)}" placeholder="بحث بالاسم أو البريد"><button>بحث</button></form><table><tr><th></th><th>الاسم</th><th>البريد</th><th>الحالة</th><th>تسجيل</th><th>آخر دخول</th><th>إجراءات</th></tr>`;
  for (const r of rows) {
    const locked = num(r.locked_until) > t0, banned = r.status === "banned";
    const av = r.avatar ? `<img src="${h(r.avatar)}" alt="">` : h([...String(r.username)][0]?.toUpperCase());
    const st = banned ? `<span class="tag b">محظور</span>` : locked ? `<span class="tag b">مقفل مؤقتًا</span>` : `<span class="tag">نشط</span>`;
    const acts = (banned ? btn("unban", r.id, "رفع الحظر", "y") : btn("ban", r.id, "حظر", "g", "حظر هذا المستخدم؟")) +
      (locked || num(r.failed) > 0 ? btn("unlock", r.id, "فتح القفل") : "") + btn("resetpw", r.id, "كلمة مرور مؤقتة", "g", "إنشاء كلمة مرور مؤقتة وتسجيل خروجه؟") +
      (r.avatar ? btn("noavatar", r.id, "حذف الصورة") : "") + btn("delete", r.id, "حذف", "r", "حذف الحساب نهائيًا؟");
    out += `<tr><td><span class="av">${av}</span></td><td>${h(r.username)}</td><td dir="ltr" style="text-align:start">${h(r.email)}</td><td>${st}</td><td>${fmt(r.created_at)}</td><td>${fmt(r.last_login)}</td><td><div class="acts">${acts}</div></td></tr>`;
  }
  if (!rows.length) out += `<tr><td colspan="7" style="text-align:center;color:#777;padding:24px">لا يوجد مستخدمون.</td></tr>`;
  out += `</table><div class="pg">${Array.from({ length: Math.min(pages, 30) }, (_, i) => `<a class="${i + 1 === pageNo ? "on" : ""}" href="?pg=${i + 1}${q ? "&q=" + encodeURIComponent(q) : ""}">${i + 1}</a>`).join("")}</div></div></div>`;
  return html("لوحة التحكم", out);
}
// ---------- admin: extra sections ----------
const TABS: [string, string][] = [["users", "المستخدمون"], ["orders", "الطلبات"], ["topups", "طلبات الشحن"], ["categories", "الأقسام"], ["products", "المنتجات"], ["wallets", "محافظ الدفع"], ["support", "الدعم"], ["settings", "الصيانة والشريط"]];
async function adminNav(cur: string) {
  const badge: Record<string, number> = {
    orders: await count(`SELECT COUNT(*) c FROM orders WHERE status = 'new'`),
    topups: await count(`SELECT COUNT(*) c FROM topups WHERE status = 'pending'`),
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
    case "wallet_save": {
      const name = f("name").trim().slice(0, 60), number = f("number").trim().slice(0, 80);
      if (!name || !number) return "اسم المحفظة ورقم الدفع مطلوبان";
      const active = f("active") === "1" ? 1 : 0;
      if (id > 0) { await run(`UPDATE wallets SET name=$1, number=$2, active=$3 WHERE id=$4`, [name, number, active, id]); if (img) await run(`UPDATE wallets SET icon = $1 WHERE id = $2`, [img, id]); }
      else await run(`INSERT INTO wallets (name, icon, number, active, created_at) VALUES ($1,$2,$3,$4,$5)`, [name, img || null, number, active, t]);
      return "تم حفظ المحفظة";
    }
    case "wallet_del": await run(`DELETE FROM wallets WHERE id = $1`, [id]); return "تم حذف المحفظة";
    case "order_status": {
      const st = f("status");
      if (!ORDER_STATUS[st]) return "حالة غير صالحة";
      if (st === "cancelled") {
        const r = await run(`UPDATE orders SET status='cancelled', updated_at=$1 WHERE id=$2 AND status IN ('new','processing') RETURNING user_id, total, product_id, qty`, [t, id]);
        if (!r.length) return "لا يمكن إلغاء هذا الطلب";
        await run(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [num(r[0].total), r[0].user_id]);
        await run(`UPDATE products SET qty = qty + $1 WHERE id = $2`, [num(r[0].qty), r[0].product_id]);
        return "تم إلغاء الطلب وإرجاع المبلغ للمستخدم";
      }
      await run(`UPDATE orders SET status=$1, updated_at=$2 WHERE id=$3 AND status <> 'cancelled'`, [st, t, id]);
      return "تم تحديث حالة الطلب";
    }
    case "topup_approve": {
      const r = await run(`UPDATE topups SET status='approved', updated_at=$1 WHERE id=$2 AND status='pending' RETURNING user_id, amount`, [t, id]);
      if (!r.length) return "الطلب غير موجود أو تمت معالجته";
      await run(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [num(r[0].amount), r[0].user_id]);
      return "تمت الموافقة وإضافة الرصيد";
    }
    case "topup_reject": {
      const r = await run(`UPDATE topups SET status='rejected', note=$1, updated_at=$2 WHERE id=$3 AND status='pending' RETURNING id`, [f("note").trim().slice(0, 200), t, id]);
      return r.length ? "تم رفض الطلب" : "الطلب غير موجود أو تمت معالجته";
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
  if (tab === "wallets") {
    out += `<div class="box"><h2>إضافة محفظة دفع</h2>${F("wallet_save", `<div class="row"><input type="text" name="name" placeholder="اسم المحفظة" required><input type="text" name="number" placeholder="رقم الدفع" dir="ltr" required><label><input type="checkbox" name="active" value="1" checked> ظاهرة</label>${picker(null)}<button class="y">إضافة</button></div>`)}</div>`;
    out += `<div class="box"><h2>محافظ الدفع (يظهر للمستخدم زر نسخ للرقم)</h2>`;
    for (const w of await run(`SELECT * FROM wallets ORDER BY id`)) {
      out += F("wallet_save", `${hid("id", w.id)}<div class="row" style="margin-bottom:8px"><input type="text" name="name" value="${h(w.name)}"><input type="text" name="number" value="${h(w.number)}" dir="ltr"><label><input type="checkbox" name="active" value="1"${num(w.active) ? " checked" : ""}> ظاهرة</label>${picker(w.icon)}<button>حفظ</button><button type="button" class="g" data-copy="${h(w.number)}">نسخ الرقم</button></div>`) +
        F("wallet_del", `${hid("id", w.id)}<button class="r" onclick="return confirm('حذف المحفظة؟')">حذف</button>`) + `<hr style="border:0;border-top:1px solid #eee">`;
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
  if (tab === "topups") {
    const sf = url.searchParams.get("st") ?? "pending";
    out += `<nav class="tabs">${[["pending", "قيد المراجعة"], ["approved", "تمت الموافقة"], ["rejected", "مرفوضة"]].map(([k, l]) => `<a class="${sf === k ? "on" : ""}" href="/admin?tab=topups&st=${k}">${l}</a>`).join("")}</nav>`;
    const rows = await run(`SELECT t.*, u.username FROM topups t LEFT JOIN users u ON u.id = t.user_id WHERE t.status = $1 ORDER BY t.id DESC LIMIT 100`, [["pending", "approved", "rejected"].includes(sf) ? sf : "pending"]);
    out += `<div class="box"><h2>طلبات الشحن (${rows.length})</h2>`;
    for (const t of rows) {
      out += `<div class="row" style="align-items:flex-start;border-bottom:1px solid #eee;padding:12px 0"><img class="rc" src="${h(t.receipt)}" alt="إيصال"><div style="flex:1;min-width:200px"><b>${h(t.username ?? "—")}</b> · ${num(t.amount)}<br><small>المحفظة: ${h(t.wallet_name)} · ${fmtT(t.created_at)}</small><br><span class="st ${h(t.status)}">${t.status === "pending" ? "قيد المراجعة" : t.status === "approved" ? "تمت الموافقة" : "مرفوض"}</span>${t.note ? `<br><small>ملاحظة: ${h(t.note)}</small>` : ""}</div>`;
      if (t.status === "pending") out += `<div>${F("topup_approve", `${hid("id", t.id)}<button class="y" onclick="return confirm('الموافقة وإضافة الرصيد؟')">موافقة وشحن</button>`, "&st=pending")}<br>${F("topup_reject", `${hid("id", t.id)}<div class="row"><input type="text" name="note" placeholder="سبب الرفض"><button class="r">رفض</button></div>`, "&st=pending")}</div>`;
      out += `</div>`;
    }
    if (!rows.length) out += `<p style="color:#777">لا توجد طلبات.</p>`;
    return out + `</div></div>`;
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

