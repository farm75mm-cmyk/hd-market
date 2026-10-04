// HD Market API entry: auth, wallet, notifications, support + shop endpoints + admin panel.
import {
  run, first, count, withTx, num, now, nowS, rnd, r4, txid, env, Fail, ok, json, cors, h, Row, Q, isDup, sha, hmac, safeEq,
  SECRET, NAME_DAYS, MAX_FAILED, LOCK_S, validName, validEmail, pl, authUser, makeToken, sendResetMail, okImg,
  CURRENCIES, getRates, getSet, putSet, balancesOf, expireStale, flushPush, notify, moveTo, audit, depOut, TONES, Push,
} from "./core";
import { SHOP, IMG, imgUrl, imgResponse } from "./shop";
import { admin } from "./panel";

// ---------- API ----------
const BASE: Record<string, (b: Row) => Promise<Response>> = {
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
    const methods = (await run(`SELECT id, name, currency, info, instructions, min_amount, max_amount, expiry_minutes, ${IMG("icon")} FROM payment_methods WHERE active = 1 ORDER BY id`))
      .map((m) => ({ id: num(m.id), name: m.name, currency: m.currency, icon: imgUrl("m", m), info: m.info, instructions: m.instructions, min_amount: num(m.min_amount), max_amount: num(m.max_amount), expiry_minutes: num(m.expiry_minutes) }));
    return ok({
      maintenance: { on: (await getSet("maint_on")) === "1", message: await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا. نعود قريبًا.") },
      banner: { on: (await getSet("banner_on")) === "1", text: await getSet("banner_text") },
      methods, rates: await getRates(),
      update: { version: (await getSet("upd_version")) || env("UPDATE_VERSION"), url: (await getSet("upd_url")) || env("UPDATE_URL"), notes: (await getSet("upd_notes")) || env("UPDATE_NOTES"), force: ((await getSet("upd_force")) || env("UPDATE_FORCE")) === "1" },
    });
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
  async push_unregister(b) {
    const u = await authUser(b);
    await run(`DELETE FROM push_tokens WHERE user_id = $1`, [u.id]);
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

const API: Record<string, (b: Row) => Promise<Response>> = { ...BASE, ...SHOP };

// ---------- server ----------
Bun.serve({
  port: Number(env("PORT", "3000")),
  maxRequestBodySize: 2 * 1024 * 1024,
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/health") return json({ ok: true });
      if (path === "/admin") return await admin(req);
      const im = path.match(/^\/img\/([a-z])\/(\d+)$/);
      if (im && req.method === "GET") return await imgResponse(im[1], Number(im[2]));
      const m = path.match(/^\/api\/(\w+)(?:\.php)?$/);
      if (m) {
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (req.method !== "POST") throw new Fail("invalid", 405);
        if (m[1] !== "config" && (await getSet("maint_on")) === "1") throw new Fail("maintenance", 503, { message: await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا.") });
        const fn = API[m[1]];
        if (!fn) throw new Fail("not_found", 404);
        if (!SECRET) throw new Fail("server_not_configured", 500);
        const raw = await req.text();
        if (raw.length > 1500000) throw new Fail("too_big", 413);
        let body: Row = {};
        try { body = JSON.parse(raw || "{}"); } catch {}
        return await fn(body && typeof body === "object" ? body : {});
      }
      if (path === "/") return new Response("HD Market API is running.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      return new Response("Not found", { status: 404 });
    } catch (e) {
      if (e instanceof Fail) return json({ error: e.code, ...e.extra }, e.status);
      console.error(e);
      return json({ error: "server" }, 500);
    }
  },
});
console.log("HD Market server up");
