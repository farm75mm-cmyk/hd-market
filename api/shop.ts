// Shop module: tools/products cart, optional products (Hay Day list), farms, subscription codes,
// random boxes, announcements, groups, delivery. Everything is priced in USDT and paid from the
// user's wallet in JOD / IQD / USDT through the exchange rates set by the admin.
import {
  run, first, count, withTx, isSqlite, serial, num, nowS, rnd, r4, txid, env, Fail, ok, json, Row, Q, isDup,
  CURRENCIES, getRates, fromUsdt, audit, getSet, putSet, balancesOf, authUser, pushTo, TONES,
} from "./core";
import food from "./food.json";

export const API_ORIGIN = env("API_ORIGIN", "https://hd-market-api-production.up.railway.app");
export const WEB_ORIGIN = env("WEB_ORIGIN", "https://hd-market-web-production.up.railway.app");

// ---------- schema ----------
const alter = async (q: string) => { try { await run(q); } catch {} };
await alter(`ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'tool'`);
await alter(`ALTER TABLE orders ADD COLUMN lines TEXT`);
await alter(`ALTER TABLE orders ADD COLUMN delivery TEXT`);
await alter(`ALTER TABLE orders ADD COLUMN delivered_at BIGINT NOT NULL DEFAULT 0`);
await alter(`ALTER TABLE orders ADD COLUMN usdt DOUBLE PRECISION NOT NULL DEFAULT 0`);
await alter(`ALTER TABLE orders ADD COLUMN ref_id BIGINT NOT NULL DEFAULT 0`);
await alter(`ALTER TABLE orders ADD COLUMN idem_key TEXT`);
await alter(`ALTER TABLE products ADD COLUMN descr TEXT`);
await alter(`ALTER TABLE products ADD COLUMN kind TEXT NOT NULL DEFAULT 'tool'`);
await run(`CREATE UNIQUE INDEX IF NOT EXISTS order_idem ON orders (user_id, idem_key)`);
await run(`CREATE TABLE IF NOT EXISTS farms (id ${serial}, name TEXT NOT NULL, image TEXT, descr TEXT, level INT NOT NULL DEFAULT 0, price DOUBLE PRECISION NOT NULL DEFAULT 0,
  active INT NOT NULL DEFAULT 1, sold INT NOT NULL DEFAULT 0, buyer_id BIGINT NOT NULL DEFAULT 0, order_id BIGINT NOT NULL DEFAULT 0, sold_at BIGINT NOT NULL DEFAULT 0,
  game_id TEXT, token TEXT, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS sub_codes (id ${serial}, product_id BIGINT NOT NULL, code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', order_id BIGINT NOT NULL DEFAULT 0,
  user_id BIGINT NOT NULL DEFAULT 0, sold_at BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE UNIQUE INDEX IF NOT EXISTS sub_code_uq ON sub_codes (product_id, code)`);
await run(`CREATE TABLE IF NOT EXISTS random_boxes (id ${serial}, name TEXT NOT NULL, image TEXT, descr TEXT, price DOUBLE PRECISION NOT NULL DEFAULT 0, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS random_prizes (id ${serial}, box_id BIGINT NOT NULL, label TEXT NOT NULL, weight INT NOT NULL DEFAULT 1, stock INT NOT NULL DEFAULT -1, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS opt_items (id INT PRIMARY KEY, name TEXT NOT NULL, level INT NOT NULL DEFAULT 0, building TEXT NOT NULL DEFAULT '', price DOUBLE PRECISION, active INT NOT NULL DEFAULT 1)`);
await run(`CREATE TABLE IF NOT EXISTS announcements (id ${serial}, title TEXT NOT NULL, body TEXT NOT NULL, image TEXT, pinned INT NOT NULL DEFAULT 0, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS hd_groups (id ${serial}, name TEXT NOT NULL, url TEXT NOT NULL, descr TEXT, image TEXT, sort INT NOT NULL DEFAULT 0, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);

// ---------- seed ----------
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["seed_opt_v1"]))) {
  for (const it of food as { id: number; n: string; l: number; b: string }[])
    await run(`INSERT INTO opt_items (id, name, level, building) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [it.id, it.n, it.l, it.b]);
  if (!(await first(`SELECT 1 FROM settings WHERE k = 'opt_price'`))) await putSet("opt_price", "0.001625");
  await putSet("seed_opt_v1", "1");
}
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["seed_axe_v1"]))) {
  let cat = await first(`SELECT id FROM categories WHERE name = $1`, ["فأس"]);
  if (!cat) {
    const mx = await first(`SELECT COALESCE(MAX(sort),0) m FROM categories`);
    cat = (await run(`INSERT INTO categories (name, image, sort, created_at) VALUES ($1,$2,$3,$4) RETURNING id`, ["فأس", "web:/img/cat/axe.jpg", num(mx?.m) + 1, nowS()]))[0];
  }
  const names = ["فأس", "مجرفة", "منشار", "تي إن تي", "ديناميت"];
  if (!(await count(`SELECT COUNT(*) c FROM products WHERE category_id = $1`, [cat!.id])))
    for (let i = 0; i < 5; i++)
      await run(`INSERT INTO products (category_id, name, image, price, qty, active, created_at, pack, max_order, kind) VALUES ($1,$2,$3,0.00025,-1,1,$4,1,9999,'tool')`, [cat!.id, names[i], `web:/img/axe/axe_${i}.webp`, nowS()]);
  await putSet("seed_axe_v1", "1");
}
if (!(await first(`SELECT 1 FROM settings WHERE k = $1`, ["seed_catimg_v1"]))) {
  await run(`UPDATE categories SET image = 'web:/img/cat/tools.jpg' WHERE image IS NULL AND name LIKE 'أدوات%'`);
  await putSet("seed_catimg_v1", "1");
}

// ---------- image helpers ----------
/** SQL fragment that fetches only what is needed to build an image URL (never the whole data URL). */
export const IMG = (c = "image", p = "") => `${p}${c} IS NOT NULL AS has_img, length(${p}${c}) AS il, substr(${p}${c}, 60, 20) AS ih, CASE WHEN ${p}${c} LIKE 'data:%' THEN '' ELSE COALESCE(${p}${c}, '') END AS img_ref`;
const vOf = (r: Row) => (num(r.il) * 31 + [...String(r.ih ?? "")].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7)).toString(36);
export function imgUrl(kind: string, r: Row): string | null {
  if (!r.has_img || r.has_img === "f" || r.has_img === 0) return null;
  const ref = String(r.img_ref ?? "");
  if (ref.startsWith("web:")) return WEB_ORIGIN + ref.slice(4);
  if (ref.startsWith("http")) return ref;
  return `${API_ORIGIN}/img/${kind}/${r.id}?v=${vOf(r)}`;
}
const IMG_TABLES: Record<string, [string, string]> = { c: ["categories", "image"], p: ["products", "image"], f: ["farms", "image"], b: ["random_boxes", "image"], m: ["payment_methods", "icon"], g: ["hd_groups", "image"], n: ["announcements", "image"] };
export async function imgResponse(kind: string, id: number): Promise<Response> {
  const t = IMG_TABLES[kind];
  const row = t ? await first(`SELECT ${t[1]} AS image FROM ${t[0]} WHERE id = $1`, [id]) : undefined;
  const v = String(row?.image ?? "");
  const m = v.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" } });
}

// ---------- push to everyone ----------
export async function pushAll(title: string, body: string, screen = "home") {
  try {
    const rows = await run(`SELECT token, tone FROM push_tokens`);
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk.map((x) => ({ to: x.token, title, body, data: { screen }, sound: x.tone === "silent" ? null : `hd_${x.tone}.wav`, channelId: `hd_support_${x.tone}`, priority: "high" }))),
      }).catch(() => {});
    }
    return rows.length;
  } catch { return 0; }
}

// ---------- ordering ----------
export const optPrice = async () => Number(await getSet("opt_price", "0.001625")) || 0.001625;
type OrderIn = { kind: string; name: string; qty: number; usdt: number; lines: any[]; refId?: number; status?: string; delivery?: string; idem?: string | null };
/** Debits the wallet and writes the order + ledger row. Must run inside withTx. */
async function placeOrder(q: Q, u: Row, cur: string, o: OrderIn) {
  const rt = await getRates(q);
  const total = fromUsdt(o.usdt, cur, rt);
  if (!(total > 0) || !Number.isFinite(total)) throw new Fail("invalid");
  const w = await q(`UPDATE user_wallets SET amount = amount - $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 AND amount >= $1 RETURNING amount`, [total, nowS(), u.id, cur]);
  if (!w.length) throw new Fail("insufficient_balance", 402, { need: total, currency: cur });
  const t = nowS();
  const ins = await q(`INSERT INTO orders (user_id, product_id, product_name, qty, total, status, created_at, updated_at, currency, kind, lines, delivery, delivered_at, usdt, ref_id, idem_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [u.id, 0, o.name.slice(0, 200), o.qty, total, o.status ?? "new", t, cur, o.kind, JSON.stringify(o.lines).slice(0, 60000), o.delivery ?? null, o.delivery ? t : 0, o.usdt, o.refId ?? 0, o.idem ?? null]);
  const after = num(w[0].amount);
  await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, note, actor, created_at) VALUES ($1,$2,$3,'purchase',$4,$5,$6,$7,$8,$9,$10)`,
    [txid("TX"), "pur:" + ins[0].id, u.id, cur, -total, r4(after + total), after, o.name.slice(0, 200), "user:" + u.id, t]);
  return { id: num(ins[0].id), total, after, currency: cur };
}
const ordOut = (o: Row) => {
  let lines: any = null; try { lines = o.lines ? JSON.parse(o.lines) : null; } catch {}
  const showDelivery = o.delivery && (o.kind !== "farm" || o.status === "done");
  return { id: num(o.id), kind: o.kind ?? "tool", name: o.product_name, qty: num(o.qty), total: num(o.total), currency: o.currency ?? "JOD", status: o.status, created_at: num(o.created_at), updated_at: num(o.updated_at), lines, delivery: showDelivery ? o.delivery : null, delivered_at: num(o.delivered_at) };
};
const curOf = (b: Row) => (CURRENCIES.includes(String(b.currency)) ? String(b.currency) : "JOD");
const idemOf = (b: Row) => String(b.idem_key ?? "").slice(0, 64) || null;
async function dupOrder(uid: any, idem: string | null) {
  if (!idem) return null;
  const ex = await first(`SELECT * FROM orders WHERE user_id = $1 AND idem_key = $2`, [uid, idem]);
  return ex ? ok({ order: ordOut(ex), balances: await balancesOf(uid), duplicate: true }) : null;
}
async function finish(uid: any, idem: string | null, fn: () => Promise<{ id: number }>) {
  try {
    const r = await fn();
    const o = (await first(`SELECT * FROM orders WHERE id = $1`, [r.id]))!;
    return ok({ order: ordOut(o), balances: await balancesOf(uid) });
  } catch (e) {
    if (isDup(e) && idem) { const d = await dupOrder(uid, idem); if (d) return d; }
    throw e;
  }
}
const prodOut = (p: Row) => ({ id: num(p.id), category_id: num(p.category_id), name: p.name, image: imgUrl("p", p), price: num(p.price), qty: num(p.qty), pack: num(p.pack) || 1, max_order: num(p.max_order), descr: p.descr ?? "" });

export const SHOP: Record<string, (b: Row) => Promise<Response>> = {
  async home() {
    const cats = await run(`SELECT c.id, c.name, c.name_en, ${IMG("image", "c.")}, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1 AND p.kind = 'tool') n FROM categories c WHERE c.active = 1 ORDER BY c.sort, c.id`);
    const ann = await run(`SELECT id, title, body, ${IMG()}, pinned, created_at FROM announcements WHERE active = 1 ORDER BY pinned DESC, id DESC LIMIT 20`);
    const grp = await run(`SELECT id, name, url, descr, ${IMG()} FROM hd_groups WHERE active = 1 ORDER BY sort, id`);
    return ok({
      categories: cats.map((c) => ({ id: num(c.id), name: c.name, name_en: c.name_en ?? "", image: imgUrl("c", c), count: num(c.n) })),
      announcements: ann.map((a) => ({ id: num(a.id), title: a.title, body: a.body, image: imgUrl("n", a), pinned: num(a.pinned), created_at: num(a.created_at) })),
      groups: grp.map((g) => ({ id: num(g.id), name: g.name, url: g.url, descr: g.descr ?? "", image: imgUrl("g", g) })),
      counts: {
        opt: await count(`SELECT COUNT(*) c FROM opt_items WHERE active = 1`),
        farms: await count(`SELECT COUNT(*) c FROM farms WHERE active = 1 AND sold = 0`),
        codes: await count(`SELECT COUNT(*) c FROM products p WHERE p.kind = 'code' AND p.active = 1`),
        boxes: await count(`SELECT COUNT(*) c FROM random_boxes WHERE active = 1`),
      },
      rates: await getRates(),
    });
  },
  async catalog() {
    const categories = await run(`SELECT id, name, name_en, ${IMG()} FROM categories WHERE active = 1 ORDER BY sort, id`);
    const products = await run(`SELECT id, category_id, name, price, qty, pack, max_order, descr, ${IMG()} FROM products WHERE active = 1 AND kind = 'tool' ORDER BY id`);
    return ok({ categories: categories.map((c) => ({ id: num(c.id), name: c.name, name_en: c.name_en ?? "", image: imgUrl("c", c) })), products: products.map(prodOut) });
  },
  async opt_items() {
    const price = await optPrice();
    const rows = await run(`SELECT id, name, level, building, price FROM opt_items WHERE active = 1 ORDER BY id`);
    return ok({ price, items: rows.map((r) => ({ id: num(r.id), n: r.name, l: num(r.level), b: r.building, p: r.price == null ? price : num(r.price), img: `${WEB_ORIGIN}/img/food/f${String(num(r.id)).padStart(3, "0")}.webp` })) });
  },
  async farms() {
    const rows = await run(`SELECT id, name, descr, level, price, ${IMG()} FROM farms WHERE active = 1 AND sold = 0 ORDER BY id DESC`);
    return ok({ farms: rows.map((f) => ({ id: num(f.id), name: f.name, descr: f.descr ?? "", level: num(f.level), price: num(f.price), image: imgUrl("f", f) })) });
  },
  async codes() {
    const rows = await run(`SELECT p.id, p.name, p.descr, p.price, ${IMG("image", "p.")}, (SELECT COUNT(*) FROM sub_codes s WHERE s.product_id = p.id AND s.status = 'available') stock FROM products p WHERE p.kind = 'code' AND p.active = 1 ORDER BY p.id`);
    return ok({ codes: rows.map((r) => ({ id: num(r.id), name: r.name, descr: r.descr ?? "", price: num(r.price), image: imgUrl("p", r), stock: num(r.stock) })) });
  },
  async boxes() {
    const rows = await run(`SELECT id, name, descr, price, ${IMG()} FROM random_boxes WHERE active = 1 ORDER BY id`);
    const out = [];
    for (const b of rows) {
      const pr = await run(`SELECT label FROM random_prizes WHERE box_id = $1 AND stock <> 0 ORDER BY id`, [b.id]);
      out.push({ id: num(b.id), name: b.name, descr: b.descr ?? "", price: num(b.price), image: imgUrl("b", b), prizes: pr.map((p) => p.label) });
    }
    return ok({ boxes: out });
  },

  // ----- purchases -----
  async checkout(b) {
    const u = await authUser(b);
    const cur = curOf(b), idem = idemOf(b), kind = b.kind === "opt" ? "opt" : "cart";
    const dup = await dupOrder(u.id, idem); if (dup) return dup;
    const raw = Array.isArray(b.lines) ? b.lines.slice(0, 400) : [];
    const want = new Map<number, number>();
    for (const l of raw) { const id = Math.floor(Number(l?.id)), q = Math.floor(Number(l?.q)); if (id >= 0 && q >= 1 && q <= 9999) want.set(id, (want.get(id) ?? 0) + q); }
    if (!want.size) throw new Fail("invalid");
    return finish(u.id, idem, () => withTx(async (q) => {
      const lines: any[] = []; let usdt = 0, qty = 0;
      if (kind === "opt") {
        const dp = await optPrice();
        for (const [id, n] of want) {
          const it = (await q(`SELECT * FROM opt_items WHERE id = $1 AND active = 1`, [id]))[0];
          if (!it) throw new Fail("not_found", 404, { id });
          const p = it.price == null ? dp : num(it.price);
          lines.push({ id, n: it.name, q: n, p }); usdt += p * n; qty += n;
        }
      } else {
        for (const [id, n] of want) {
          const p = (await q(`SELECT * FROM products WHERE id = $1 AND active = 1 AND kind = 'tool'`, [id]))[0];
          if (!p) throw new Fail("not_found", 404, { id });
          if (num(p.max_order) > 0 && n > num(p.max_order)) throw new Fail("limit_exceeded", 400, { max: num(p.max_order), id });
          if (!(await q(`UPDATE products SET qty = qty - $1 WHERE id = $2 AND (qty < 0 OR qty >= $1) RETURNING id`, [n, id])).length) throw new Fail("out_of_stock", 409, { id });
          lines.push({ id, n: p.name, q: n, p: num(p.price) }); usdt += num(p.price) * n; qty += n;
        }
      }
      usdt = Math.round(usdt * 1e8) / 1e8;
      const name = lines.length === 1 ? `${lines[0].n} × ${lines[0].q}` : (kind === "opt" ? "منتجات اختياري" : "طلب أدوات") + ` (${qty})`;
      return placeOrder(q, u, cur, { kind: kind === "opt" ? "opt" : "tool", name, qty, usdt, lines, idem });
    }));
  },
  async farm_buy(b) {
    const u = await authUser(b);
    const cur = curOf(b), idem = idemOf(b);
    const dup = await dupOrder(u.id, idem); if (dup) return dup;
    return finish(u.id, idem, () => withTx(async (q) => {
      const f = (await q(`UPDATE farms SET sold = 1, buyer_id = $1, sold_at = $2 WHERE id = $3 AND sold = 0 AND active = 1 RETURNING *`, [u.id, nowS(), Number(b.id)]))[0];
      if (!f) throw new Fail("out_of_stock", 409);
      const r = await placeOrder(q, u, cur, { kind: "farm", name: f.name, qty: 1, usdt: num(f.price), lines: [{ id: num(f.id), n: f.name, q: 1, p: num(f.price) }], refId: num(f.id), idem });
      await q(`UPDATE farms SET order_id = $1 WHERE id = $2`, [r.id, f.id]);
      return r;
    }));
  },
  async code_buy(b) {
    const u = await authUser(b);
    const cur = curOf(b), idem = idemOf(b), n = Math.min(10, Math.max(1, Math.floor(Number(b.qty)) || 1));
    const dup = await dupOrder(u.id, idem); if (dup) return dup;
    return finish(u.id, idem, () => withTx(async (q) => {
      const p = (await q(`SELECT * FROM products WHERE id = $1 AND kind = 'code' AND active = 1`, [Number(b.id)]))[0];
      if (!p) throw new Fail("not_found", 404);
      const r = await placeOrder(q, u, cur, { kind: "code", name: `${p.name} × ${n}`, qty: n, usdt: num(p.price) * n, lines: [{ id: num(p.id), n: p.name, q: n, p: num(p.price) }], refId: num(p.id), status: "done", idem, delivery: "—" });
      const codes: string[] = [];
      for (let i = 0; i < n; i++) {
        let got: Row | undefined;
        for (let tries = 0; tries < 6 && !got; tries++) {
          const c = (await q(`SELECT id FROM sub_codes WHERE product_id = $1 AND status = 'available' ORDER BY id LIMIT 1`, [p.id]))[0];
          if (!c) break;
          got = (await q(`UPDATE sub_codes SET status = 'sold', order_id = $1, user_id = $2, sold_at = $3 WHERE id = $4 AND status = 'available' RETURNING code`, [r.id, u.id, nowS(), c.id]))[0];
        }
        if (!got) throw new Fail("out_of_stock", 409);
        codes.push(got.code);
      }
      await q(`UPDATE orders SET delivery = $1, delivered_at = $2 WHERE id = $3`, [codes.join("\n"), nowS(), r.id]);
      return r;
    }));
  },
  async random_buy(b) {
    const u = await authUser(b);
    const cur = curOf(b), idem = idemOf(b);
    const dup = await dupOrder(u.id, idem); if (dup) return dup;
    return finish(u.id, idem, () => withTx(async (q) => {
      const box = (await q(`SELECT * FROM random_boxes WHERE id = $1 AND active = 1`, [Number(b.id)]))[0];
      if (!box) throw new Fail("not_found", 404);
      const prizes = await q(`SELECT * FROM random_prizes WHERE box_id = $1 AND stock <> 0 AND weight > 0 ORDER BY id`, [box.id]);
      if (!prizes.length) throw new Fail("out_of_stock", 409);
      const total = prizes.reduce((a, p) => a + num(p.weight), 0);
      let pick = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * total, prize = prizes[prizes.length - 1];
      for (const p of prizes) { pick -= num(p.weight); if (pick < 0) { prize = p; break; } }
      if (num(prize.stock) > 0 && !(await q(`UPDATE random_prizes SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING id`, [prize.id])).length) throw new Fail("out_of_stock", 409);
      return placeOrder(q, u, cur, { kind: "random", name: box.name, qty: 1, usdt: num(box.price), lines: [{ id: num(box.id), n: box.name, q: 1, p: num(box.price), prize: prize.label }], refId: num(box.id), idem });
    }));
  },
  async orders(b) {
    const u = await authUser(b);
    const rows = await run(`SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [u.id]);
    return ok({ orders: rows.map(ordOut) });
  },
  async announcements() {
    const rows = await run(`SELECT id, title, body, ${IMG()}, pinned, created_at FROM announcements WHERE active = 1 ORDER BY pinned DESC, id DESC LIMIT 50`);
    return ok({ items: rows.map((a) => ({ id: num(a.id), title: a.title, body: a.body, image: imgUrl("n", a), pinned: num(a.pinned), created_at: num(a.created_at) })) });
  },
};

/** Refunds an order that was not delivered yet (used by the admin panel). Returns an Arabic message. */
export async function cancelOrder(id: number, actor: string): Promise<string> {
  try {
    await withTx(async (q) => {
      const o = (await q(`SELECT * FROM orders WHERE id = $1`, [id]))[0];
      if (!o || !["new", "processing"].includes(o.status)) throw new Fail("no");
      if (o.kind === "code") throw new Fail("no");
      const r = await q(`UPDATE orders SET status = 'cancelled', updated_at = $1 WHERE id = $2 AND status IN ('new','processing') RETURNING id`, [nowS(), id]);
      if (!r.length) throw new Fail("no");
      const cur = o.currency, tot = num(o.total), t = nowS();
      await q(`INSERT INTO user_wallets (user_id, currency, amount, updated_at) VALUES ($1,$2,0,$3) ON CONFLICT (user_id, currency) DO NOTHING`, [o.user_id, cur, t]);
      const w = await q(`UPDATE user_wallets SET amount = amount + $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 RETURNING amount`, [tot, t, o.user_id, cur]);
      const a = num(w[0].amount);
      await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, note, actor, created_at) VALUES ($1,$2,$3,'refund',$4,$5,$6,$7,$8,$9,$10)`, [txid("TX"), "ref:" + id, o.user_id, cur, tot, r4(a - tot), a, `إلغاء الطلب #${id}`, actor, t]);
      if (o.kind === "farm") await q(`UPDATE farms SET sold = 0, buyer_id = 0, order_id = 0, sold_at = 0 WHERE id = $1`, [o.ref_id]);
      else if (o.lines) { try { if (o.kind === "tool") for (const l of JSON.parse(o.lines)) await q(`UPDATE products SET qty = qty + $1 WHERE id = $2 AND qty >= 0`, [num(l.q), l.id]); } catch {} }
      else if (num(o.product_id) > 0) await q(`UPDATE products SET qty = qty + $1 WHERE id = $2 AND qty >= 0`, [num(o.qty), o.product_id]);
      await audit(q, actor, "cancel_order_refund", "order", id, { amount: tot, currency: cur, kind: o.kind });
      await q(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,'order',$2,$3,$4,$5,$6,$7)`,
        [o.user_id, "تم إلغاء طلبك وإرجاع المبلغ", `أُرجع ${tot} ${cur} إلى محفظتك (الطلب #${id}).`, "Order cancelled and refunded", `${tot} ${cur} was returned to your wallet (order #${id}).`, "ORD-" + id, t]);
    });
  } catch (e) { if (e instanceof Fail) return "لا يمكن إلغاء هذا الطلب"; throw e; }
  await notifyOrderPush(id, "تم إلغاء طلبك وإرجاع المبلغ");
  return "تم إلغاء الطلب وإرجاع المبلغ للمستخدم";
}
async function notifyOrderPush(id: number, text: string) {
  const o = await first(`SELECT user_id FROM orders WHERE id = $1`, [id]);
  if (o) await pushTo(Number(o.user_id), "HD Market", text, "orders");
}
/** Marks an order as delivered; farm orders send the farm's ID/Token to the buyer. */
export async function deliverOrder(id: number, actor: string, note = ""): Promise<string> {
  const o = await first(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (!o || !["new", "processing"].includes(o.status)) return "لا يمكن تسليم هذا الطلب";
  let text = note.trim();
  if (o.kind === "farm") {
    const f = await first(`SELECT game_id, token FROM farms WHERE id = $1`, [o.ref_id]);
    if (!f || (!f.game_id && !f.token && !text)) return "أدخل بيانات المزرعة (ID / Token) أولًا من صفحة «بيانات المزارع»";
    text = [f.game_id ? `ID: ${f.game_id}` : "", f.token ? `Token: ${f.token}` : "", text].filter(Boolean).join("\n");
  }
  const t = nowS();
  const r = await run(`UPDATE orders SET status = 'done', delivery = $1, delivered_at = $2, updated_at = $2 WHERE id = $3 AND status IN ('new','processing') RETURNING id`, [text || null, t, id]);
  if (!r.length) return "تمت معالجة الطلب مسبقًا";
  await audit(run, actor, "deliver_order", "order", id, { kind: o.kind });
  await run(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,'order',$2,$3,$4,$5,$6,$7)`,
    [o.user_id, "تم تسليم طلبك", `تم تسليم الطلب #${id}. افتح «طلباتي» لعرض التفاصيل.`, "Your order was delivered", `Order #${id} was delivered. Open "My orders" for details.`, "ORD-" + id, t]);
  await notifyOrderPush(id, "تم تسليم طلبك");
  return "تم التسليم وإرسال البيانات للمستخدم";
}
/** Admin balance correction: atomic, never below zero, always in the ledger + audit log. */
export async function adjustBalance(uid: number, cur: string, amount: number, reason: string, actor: string): Promise<string> {
  if (!CURRENCIES.includes(cur) || !Number.isFinite(amount) || amount === 0 || !reason.trim()) return "أدخل العملة والمبلغ (موجب أو سالب) والسبب";
  amount = r4(amount);
  try {
    await withTx(async (q) => {
      if (!(await q(`SELECT 1 FROM users WHERE id = $1`, [uid])).length) throw new Fail("no");
      const t = nowS();
      await q(`INSERT INTO user_wallets (user_id, currency, amount, updated_at) VALUES ($1,$2,0,$3) ON CONFLICT (user_id, currency) DO NOTHING`, [uid, cur, t]);
      const w = await q(`UPDATE user_wallets SET amount = amount + $1, updated_at = $2 WHERE user_id = $3 AND currency = $4 AND amount + $1 >= 0 RETURNING amount`, [amount, t, uid, cur]);
      if (!w.length) throw new Fail("insufficient");
      const a = num(w[0].amount);
      await q(`INSERT INTO transactions (txn_id, ref_key, user_id, type, currency, amount, balance_before, balance_after, note, actor, created_at) VALUES ($1,$2,$3,'adjust',$4,$5,$6,$7,$8,$9,$10)`, [txid("TX"), "adj:" + rnd(8), uid, cur, amount, r4(a - amount), a, reason.slice(0, 300), actor, t]);
      await audit(q, actor, "adjust_balance", "user", uid, { currency: cur, amount, reason, after: a });
      await q(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,'adjust',$2,$3,$4,$5,'',$6)`,
        [uid, "تم تعديل رصيدك", `${amount > 0 ? "أُضيف" : "خُصم"} ${Math.abs(amount)} ${cur}. السبب: ${reason.slice(0, 200)}`, "Your balance was adjusted", `${Math.abs(amount)} ${cur} was ${amount > 0 ? "added" : "deducted"}. Reason: ${reason.slice(0, 200)}`, t]);
    });
  } catch (e) { if (e instanceof Fail) return e.code === "insufficient" ? "الرصيد لا يكفي للخصم" : "المستخدم غير موجود"; throw e; }
  await pushTo(uid, "HD Market", "تم تعديل رصيدك", "wallet");
  return "تم تعديل الرصيد";
}
