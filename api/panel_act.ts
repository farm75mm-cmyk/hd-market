// Admin panel: every POST action. Each returns an Arabic flash message.
import {
  run, first, count, withTx, num, nowS, rnd, r4, env, Fail, okImg, actor, isOwner, CURRENCIES, getRates, getSet, putSet, audit, FLOW, moveTo, creditOrder,
  reverseOrder, notify, flushPush, isDup, Push, sendPush, pushTo,
} from "./core";
import { ADMIN_EMAIL, ADMIN_USER } from "./core";
import { assistAct } from "./assist";
import { pushSend } from "./broadcast";
import { cancelOrder, deliverOrder, adjustBalance, zeroWallet, pushAll } from "./shop";

type F = (k: string) => string;
const NO_GENERIC_AUDIT = new Set(["admin_add", "admin_delete", "admin_ban", "admin_unban", "dep_move", "dep_mismatch", "dep_reject", "dep_approve", "dep_reverse", "dep_cancel", "method_save", "method_toggle", "method_del", "rate_save", "bal_adjust", "wallet_zero", "order_status", "order_deliver", "support_reply", "ban", "unban", "unlock", "noavatar", "resetpw", "delete"]);
const HIDE = new Set(["image", "csrf", "do", "token", "game_id", "codes", "password"]);
const ORDER_ST = ["new", "processing", "done", "cancelled"];
const bool = (v: string) => (v === "1" || v === "on" ? 1 : 0);

async function orderNote(id: number, title: string, body: string, tEn: string, bEn: string) {
  const o = await first(`SELECT user_id FROM orders WHERE id = $1`, [id]);
  if (!o) return;
  await run(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,'order',$2,$3,$4,$5,$6,$7)`, [o.user_id, title, body, tEn, bEn, "ORD-" + id, nowS()]);
  await pushTo(Number(o.user_id), "HD Market", title, "orders");
}

export async function adminAct(act: string, f: F, visibleForm: Record<string, string>): Promise<string> {
  const id = Number(f("id")), t = nowS();
  if (act.startsWith("admin_") && !isOwner()) return "هذا الإجراء للمالك فقط";
  const img = f("image");
  if (img && !okImg(img)) return "الصورة غير صالحة (jpeg/png/webp وحجم أصغر).";
  if (act && !NO_GENERIC_AUDIT.has(act)) {
    const det: Record<string, string> = {};
    for (const [k, v] of Object.entries(visibleForm)) if (!HIDE.has(k) && v !== "") det[k] = v.slice(0, 120);
    if (Object.keys(det).length || id) await audit(run, actor(), act, "admin", id || "", det);
  }
  if (act.startsWith("ai_")) return assistAct(act, f, id);
  switch (act) {
    // ----- panel admins (owner only) -----
    case "admin_add": {
      const name = f("name").trim().slice(0, 40), email = f("email").trim().toLowerCase(), pass = f("password");
      if (name.length < 2) return "اسم المسؤول مطلوب (حرفان على الأقل)";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "أدخل بريداً إلكترونياً صحيحاً";
      if (pass.length < 8 || pass.length > 200) return "كلمة المرور 8 أحرف على الأقل";
      if (email === ADMIN_EMAIL || name.toLowerCase() === ADMIN_USER.toLowerCase()) return "هذا الاسم أو البريد محجوز للمالك";
      if (await first(`SELECT id FROM admins WHERE name_lc = $1 OR email = $2`, [name.toLowerCase(), email])) return "الاسم أو البريد مضاف مسبقاً";
      const r = await run(`INSERT INTO admins (name, name_lc, email, password_hash, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [name, name.toLowerCase(), email, await Bun.password.hash(pass), actor(), t]);
      await audit(run, actor(), "admin_add", "panel_admin", r[0].id, { name, email });
      return "تمت إضافة المسؤول";
    }
    case "admin_delete": case "admin_ban": case "admin_unban": {
      const a = await first(`SELECT id, name, email FROM admins WHERE id = $1`, [id]);
      if (!a) return "المسؤول غير موجود";
      if (act === "admin_delete") await run(`DELETE FROM admins WHERE id = $1`, [id]);
      else await run(`UPDATE admins SET status = $1 WHERE id = $2`, [act === "admin_ban" ? "banned" : "active", id]);
      await audit(run, actor(), act, "panel_admin", id, { name: a.name, email: a.email });
      return act === "admin_delete" ? "تم حذف المسؤول" : act === "admin_ban" ? "تم حظر المسؤول ومنعه من الدخول" : "تم رفع الحظر عن المسؤول";
    }
    // ----- store: categories & tool products -----
    case "cat_save": {
      const name = f("name").trim().slice(0, 60); if (!name) return "اسم القسم مطلوب";
      const nameEn = f("name_en").trim().slice(0, 60), sort = Number(f("sort")) || 0, active = bool(f("active"));
      if (id > 0) {
        await run(`UPDATE categories SET name = $1, name_en = $2, sort = $3, active = $4 WHERE id = $5`, [name, nameEn, sort, active, id]);
        if (f("remove_image") === "1" && !img) await run(`UPDATE categories SET image = NULL WHERE id = $1`, [id]);
        if (img) await run(`UPDATE categories SET image = $1 WHERE id = $2`, [img, id]);
      } else await run(`INSERT INTO categories (name, name_en, image, sort, active, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [name, nameEn, img || null, sort, active, t]);
      return "تم حفظ القسم";
    }
    case "cat_del": await run(`DELETE FROM products WHERE category_id = $1 AND kind = 'tool'`, [id]); await run(`DELETE FROM categories WHERE id = $1`, [id]); return "تم حذف القسم ومنتجاته";
    case "prod_save": {
      const name = f("name").trim().slice(0, 100), cat = Number(f("category_id")), price = Math.max(0, Number(f("price")) || 0), active = bool(f("active")), needTag = bool(f("need_tag"));
      const qtyRaw = f("qty").trim(), qty = qtyRaw === "" ? -1 : Math.max(-1, Math.floor(Number(qtyRaw)) || 0);
      const maxo = Math.max(0, Math.floor(Number(f("max_order"))) || 0), descr = f("descr").trim().slice(0, 500);
      if (!name || !(cat > 0)) return "الاسم والقسم مطلوبان";
      if (!(price > 0)) return "أدخل سعرًا أكبر من صفر (بالـ USDT)";
      if (id > 0) { await run(`UPDATE products SET name=$1, category_id=$2, price=$3, qty=$4, active=$5, max_order=$6, need_tag=$7, descr=$8 WHERE id=$9`, [name, cat, price, qty, active, maxo, needTag, descr, id]); if (img) await run(`UPDATE products SET image = $1 WHERE id = $2`, [img, id]); if (f("remove_image") === "1" && !img) await run(`UPDATE products SET image = NULL WHERE id = $1`, [id]); }
      else await run(`INSERT INTO products (category_id, name, image, price, qty, active, created_at, pack, max_order, kind, descr, need_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,'tool',$9,$10)`, [cat, name, img || null, price, qty, active, t, maxo, descr, needTag]);
      return "تم حفظ المنتج";
    }
    case "prod_del": await run(`DELETE FROM products WHERE id = $1 AND kind = 'tool'`, [id]); return "تم حذف المنتج";

    // ----- farms -----
    case "farm_save": {
      const name = f("name").trim().slice(0, 100), price = Math.max(0, Number(f("price")) || 0), level = Math.max(0, Math.floor(Number(f("level")) || 0)), descr = f("descr").trim().slice(0, 800);
      if (!name || !(price > 0)) return "اسم المزرعة والسعر (USDT) مطلوبان";
      if (id > 0) {
        await run(`UPDATE farms SET name=$1, price=$2, level=$3, descr=$4, active=$5 WHERE id=$6`, [name, price, level, descr, bool(f("active")), id]);
        if (img) await run(`UPDATE farms SET image = $1 WHERE id = $2`, [img, id]);
      } else await run(`INSERT INTO farms (name, image, descr, level, price, active, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [name, img || null, descr, level, price, bool(f("active")), t]);
      return "تم حفظ المزرعة";
    }
    case "farm_del": {
      const fm = await first(`SELECT sold FROM farms WHERE id = $1`, [id]);
      if (!fm) return "غير موجودة";
      if (num(fm.sold)) return "المزرعة مباعة ولا يمكن حذفها (أخفِها بدل ذلك)";
      await run(`DELETE FROM farms WHERE id = $1`, [id]); return "تم حذف المزرعة";
    }
    case "farm_creds": {
      await run(`UPDATE farms SET game_id = $1, token = $2 WHERE id = $3`, [f("game_id").trim().slice(0, 300), f("token").trim().slice(0, 2000), id]);
      await audit(run, actor(), "farm_credentials_updated", "farm", id, {});
      return "تم حفظ بيانات المزرعة";
    }

    // ----- subscription codes -----
    case "code_plan_save": {
      const name = f("name").trim().slice(0, 100), price = Math.max(0, Number(f("price")) || 0), descr = f("descr").trim().slice(0, 500);
      if (!name || !(price > 0)) return "الاسم والسعر (USDT) مطلوبان";
      if (id > 0) { await run(`UPDATE products SET name=$1, price=$2, descr=$3, active=$4 WHERE id=$5 AND kind='code'`, [name, price, descr, bool(f("active")), id]); if (img) await run(`UPDATE products SET image=$1 WHERE id=$2`, [img, id]); }
      else await run(`INSERT INTO products (category_id, name, image, price, qty, active, created_at, pack, max_order, kind, descr) VALUES (0,$1,$2,$3,0,$4,$5,1,10,'code',$6)`, [name, img || null, price, bool(f("active")), t, descr]);
      return "تم حفظ الباقة";
    }
    case "code_plan_del": {
      if (await count(`SELECT COUNT(*) c FROM sub_codes WHERE product_id = $1 AND status = 'sold'`, [id]) > 0) { await run(`UPDATE products SET active = 0 WHERE id = $1`, [id]); return "للباقة أكواد مباعة، لذلك تم إخفاؤها بدل حذفها"; }
      await run(`DELETE FROM sub_codes WHERE product_id = $1`, [id]); await run(`DELETE FROM products WHERE id = $1 AND kind = 'code'`, [id]); return "تم حذف الباقة";
    }
    case "code_add": {
      const lines = [...new Set(f("codes").split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].slice(0, 2000);
      if (!lines.length) return "الصق الأكواد، كل كود في سطر";
      let added = 0;
      for (const c of lines) { if (await first(`SELECT 1 FROM sub_codes WHERE product_id = $1 AND code = $2`, [id, c.slice(0, 500)])) continue; await run(`INSERT INTO sub_codes (product_id, code, created_at) VALUES ($1,$2,$3)`, [id, c.slice(0, 500), t]); added++; }
      await audit(run, actor(), "add_codes", "product", id, { added, skipped: lines.length - added });
      return `أُضيف ${added} كود` + (lines.length - added ? ` (تم تخطي ${lines.length - added} مكرر)` : "");
    }
    case "code_del": await run(`DELETE FROM sub_codes WHERE id = $1 AND status = 'available'`, [id]); return "تم حذف الكود";

    // ----- random boxes -----
    case "box_save": {
      const name = f("name").trim().slice(0, 100), price = Math.max(0, Number(f("price")) || 0), descr = f("descr").trim().slice(0, 500);
      if (!name || !(price > 0)) return "الاسم والسعر (USDT) مطلوبان";
      if (id > 0) { await run(`UPDATE random_boxes SET name=$1, price=$2, descr=$3, active=$4 WHERE id=$5`, [name, price, descr, bool(f("active")), id]); if (img) await run(`UPDATE random_boxes SET image=$1 WHERE id=$2`, [img, id]); }
      else await run(`INSERT INTO random_boxes (name, image, descr, price, active, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [name, img || null, descr, price, bool(f("active")), t]);
      return "تم حفظ الصندوق";
    }
    case "box_del": {
      if (await count(`SELECT COUNT(*) c FROM orders WHERE kind = 'random' AND ref_id = $1`, [id]) > 0) { await run(`UPDATE random_boxes SET active = 0 WHERE id = $1`, [id]); return "للصندوق طلبات سابقة، لذلك تم إخفاؤه بدل حذفه"; }
      await run(`DELETE FROM random_prizes WHERE box_id = $1`, [id]); await run(`DELETE FROM random_boxes WHERE id = $1`, [id]); return "تم حذف الصندوق";
    }
    case "prize_save": {
      const label = f("label").trim().slice(0, 120), weight = Math.max(1, Math.floor(Number(f("weight")) || 1)), stock = Math.max(-1, Math.floor(Number(f("stock") === "" ? -1 : f("stock"))));
      if (!label) return "اسم الجائزة مطلوب";
      if (id > 0) await run(`UPDATE random_prizes SET label=$1, weight=$2, stock=$3 WHERE id=$4`, [label, weight, stock, id]);
      else await run(`INSERT INTO random_prizes (box_id, label, weight, stock, created_at) VALUES ($1,$2,$3,$4,$5)`, [Number(f("box_id")), label, weight, stock, t]);
      return "تم حفظ الجائزة";
    }
    case "prize_del": await run(`DELETE FROM random_prizes WHERE id = $1`, [id]); return "تم حذف الجائزة";

    // ----- optional products -----
    case "opt_price_save": {
      const p = Number(f("price"));
      if (!(p > 0) || !Number.isFinite(p)) return "أدخل سعرًا صحيحًا";
      await putSet("opt_price", String(p)); return "تم حفظ السعر الافتراضي";
    }
    case "opt_item_save": {
      const p = f("price").trim() === "" ? null : Number(f("price"));
      if (p !== null && !(p > 0)) return "سعر غير صالح";
      await run(`UPDATE opt_items SET price = $1, active = $2 WHERE id = $3`, [p, bool(f("active")), id]); return "تم الحفظ";
    }
    case "opt_reset": await run(`UPDATE opt_items SET price = NULL`); return "أُزيلت كل الأسعار الخاصة، وصار الجميع بالسعر الافتراضي";

    // ----- groups & announcements -----
    case "group_save": {
      const name = f("name").trim().slice(0, 80), url = f("url").trim().slice(0, 500);
      if (!name || !/^https?:\/\//i.test(url)) return "الاسم ورابط صحيح يبدأ بـ https:// مطلوبان";
      if (id > 0) { await run(`UPDATE hd_groups SET name=$1, url=$2, descr=$3, sort=$4, active=$5 WHERE id=$6`, [name, url, f("descr").trim().slice(0, 300), Number(f("sort")) || 0, bool(f("active")), id]); if (img) await run(`UPDATE hd_groups SET image=$1 WHERE id=$2`, [img, id]); }
      else await run(`INSERT INTO hd_groups (name, url, descr, image, sort, active, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [name, url, f("descr").trim().slice(0, 300), img || null, Number(f("sort")) || 0, bool(f("active")), t]);
      return "تم حفظ المجموعة";
    }
    case "group_del": await run(`DELETE FROM hd_groups WHERE id = $1`, [id]); return "تم حذف المجموعة";
    case "ann_save": {
      const title = f("title").trim().slice(0, 120), body = f("body").trim().slice(0, 2000);
      if (!title || !body) return "العنوان والنص مطلوبان";
      if (id > 0) { await run(`UPDATE announcements SET title=$1, body=$2, pinned=$3, active=$4 WHERE id=$5`, [title, body, bool(f("pinned")), bool(f("active")), id]); if (img) await run(`UPDATE announcements SET image=$1 WHERE id=$2`, [img, id]); return "تم حفظ الإعلان"; }
      await run(`INSERT INTO announcements (title, body, image, pinned, active, created_at) VALUES ($1,$2,$3,$4,1,$5)`, [title, body, img || null, bool(f("pinned")), t]);
      if (bool(f("push"))) { const n = await pushAll(title, body.slice(0, 120), "home"); return `تم نشر الإعلان وإرسال إشعار إلى ${n} جهاز`; }
      return "تم نشر الإعلان";
    }
    case "ann_push": { const a = await first(`SELECT title, body FROM announcements WHERE id = $1`, [id]); if (!a) return "غير موجود"; const n = await pushAll(a.title, String(a.body).slice(0, 120), "home"); return `أُرسل الإشعار إلى ${n} جهاز`; }
    case "ann_del": await run(`DELETE FROM announcements WHERE id = $1`, [id]); return "تم حذف الإعلان";

    // ----- orders -----
    case "order_status": {
      const st = f("status");
      if (!ORDER_ST.includes(st)) return "حالة غير صالحة";
      if (st === "cancelled") return cancelOrder(id, actor());
      if (st === "done") { const o = await first(`SELECT kind, status FROM orders WHERE id = $1`, [id]); if (o?.kind === "farm" && ["new", "processing"].includes(o.status)) return deliverOrder(id, actor(), f("note")); }
      const r = await run(`UPDATE orders SET status=$1, updated_at=$2, delivered_at = CASE WHEN $1 = 'done' THEN $2 ELSE delivered_at END WHERE id=$3 AND status NOT IN ('cancelled') AND status <> $1 RETURNING id`, [st, t, id]);
      if (!r.length) return "لا تغيير";
      await audit(run, actor(), "order_status", "order", id, { status: st });
      const lab: Record<string, [string, string]> = { processing: ["طلبك قيد التنفيذ", "Your order is being processed"], done: ["تم إكمال طلبك", "Your order is complete"], new: ["أُعيد طلبك إلى الانتظار", "Your order is pending"] };
      await orderNote(id, lab[st][0], `الطلب #${id}`, lab[st][1], `Order #${id}`);
      return "تم تحديث حالة الطلب";
    }
    case "order_deliver": return deliverOrder(id, actor(), f("note"));

    // ----- wallet: payment methods / rates / deposits -----
    case "method_save": {
      const name = f("name").trim().slice(0, 60), info = f("info").trim().slice(0, 300), cur = f("currency");
      if (!name || !info || !CURRENCIES.includes(cur)) return "الاسم والعملة ومعلومات الدفع مطلوبة";
      const minA = Math.max(0, r4(Number(f("min_amount")) || 0)), maxA = Math.max(0, r4(Number(f("max_amount")) || 0));
      if (maxA > 0 && maxA < minA) return "الحد الأقصى أقل من الحد الأدنى";
      const exp = Math.min(10080, Math.max(1, Math.floor(Number(f("expiry_minutes")) || 60))), active = bool(f("active")), ins = f("instructions").trim().slice(0, 600);
      if (id > 0) {
        await run(`UPDATE payment_methods SET name=$1, currency=$2, info=$3, instructions=$4, min_amount=$5, max_amount=$6, expiry_minutes=$7, active=$8, updated_at=$9 WHERE id=$10`, [name, cur, info, ins, minA, maxA, exp, active, t, id]);
        if (img) await run(`UPDATE payment_methods SET icon = $1 WHERE id = $2`, [img, id]);
        await audit(run, actor(), "update_payment_method", "payment_method", id, { name, currency: cur, info, min: minA, max: maxA, expiry: exp, active });
      } else {
        const r = await run(`INSERT INTO payment_methods (name, currency, icon, info, instructions, min_amount, max_amount, expiry_minutes, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`, [name, cur, img || null, info, ins, minA, maxA, exp, active, t]);
        await audit(run, actor(), "create_payment_method", "payment_method", r[0].id, { name, currency: cur, info, min: minA, max: maxA, expiry: exp, active });
      }
      return "تم حفظ طريقة الدفع";
    }
    case "method_toggle": {
      const m = await first(`SELECT active FROM payment_methods WHERE id = $1`, [id]); if (!m) return "غير موجودة";
      const na = num(m.active) ? 0 : 1;
      await run(`UPDATE payment_methods SET active = $1, updated_at = $2 WHERE id = $3`, [na, t, id]);
      await audit(run, actor(), na ? "enable_payment_method" : "disable_payment_method", "payment_method", id, {});
      return na ? "تم تفعيل الطريقة" : "تم تعطيل الطريقة";
    }
    case "method_del": {
      if (await count(`SELECT COUNT(*) c FROM deposit_orders WHERE method_id = $1`, [id]) > 0) {
        await run(`UPDATE payment_methods SET active = 0, updated_at = $1 WHERE id = $2`, [t, id]);
        await audit(run, actor(), "disable_payment_method", "payment_method", id, { reason: "has_financial_records" });
        return "الطريقة مرتبطة بعمليات مالية سابقة، لذلك تم تعطيلها بدل حذفها";
      }
      await run(`DELETE FROM payment_methods WHERE id = $1`, [id]);
      await audit(run, actor(), "delete_payment_method", "payment_method", id, {});
      return "تم حذف طريقة الدفع";
    }
    case "rate_save": {
      const old = await getRates(), out: string[] = [];
      for (const c of ["JOD", "IQD"]) {
        const v = Number(f("rate_" + c));
        if (!(v > 0) || !Number.isFinite(v)) return "أدخل سعر صرف صحيحًا لكل عملة";
        if (Math.abs(v - (old[c] ?? 0)) > 1e-9) {
          await run(`UPDATE exchange_rates SET per_usdt = $1, updated_at = $2, updated_by = $3 WHERE currency = $4`, [v, t, actor(), c]);
          await run(`INSERT INTO exchange_rate_history (currency, old_rate, new_rate, actor, created_at) VALUES ($1,$2,$3,$4,$5)`, [c, old[c] ?? null, v, actor(), t]);
          await audit(run, actor(), "update_exchange_rate", "exchange_rate", c, { old: old[c], new: v });
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
            const n = await moveTo(q, o, to, actor(), note, { admin_actor: actor() });
            await audit(q, actor(), "change_status", "deposit_order", n.txn_id, { from: o.status, to });
            await notify(q, pushes, n, to);
          } else if (act === "dep_mismatch") {
            const paid = r4(Number(f("paid")));
            if (!(paid > 0) || Math.abs(paid - num(o.amount)) < 1e-9) throw new Fail("invalid");
            const n = await moveTo(q, o, "amount_mismatch", actor(), `المدفوع ${paid} مقابل المطلوب ${num(o.amount)}`, { paid_amount: paid, admin_actor: actor() });
            await audit(q, actor(), "amount_mismatch", "deposit_order", n.txn_id, { requested: num(o.amount), paid, diff: r4(paid - num(o.amount)) });
            await notify(q, pushes, n, "amount_mismatch");
          } else if (act === "dep_reject") {
            if (!note) throw new Fail("reason_required");
            const n = await moveTo(q, o, "rejected", actor(), note, { reject_reason: note, admin_actor: actor() });
            await audit(q, actor(), "reject_deposit", "deposit_order", n.txn_id, { reason: note });
            await notify(q, pushes, n, "rejected", { r: note });
          } else if (act === "dep_cancel") {
            const n = await moveTo(q, o, "cancelled", actor(), note || "إلغاء من المسؤول", { admin_actor: actor() });
            await audit(q, actor(), "cancel_deposit", "deposit_order", n.txn_id, { note });
            await notify(q, pushes, n, "cancelled");
          } else if (act === "dep_approve") {
            const usePaid = f("use") === "paid" && o.status === "amount_mismatch" && o.paid_amount != null;
            await audit(q, actor(), "approve_deposit", "deposit_order", o.txn_id, { use: usePaid ? "paid" : "requested" });
            await creditOrder(q, pushes, o, actor(), usePaid ? num(o.paid_amount) : num(o.amount), note);
          } else {
            if (!note) throw new Fail("reason_required");
            await reverseOrder(q, pushes, o, actor(), note);
          }
        });
      } catch (e) {
        if (e instanceof Fail) return ({ bad_transition: "لا يمكن هذا الانتقال من الحالة الحالية (ربما تمت معالجته)", duplicate: "تمت معالجة هذه العملية مسبقًا", reason_required: "السبب مطلوب", invalid: "قيمة غير صالحة", insufficient_for_reversal: "رصيد المستخدم الحالي لا يكفي لعكس العملية" } as Record<string, string>)[e.code] ?? "تعذّر تنفيذ العملية";
        throw e;
      }
      await flushPush(pushes);
      return "تم تنفيذ الإجراء";
    }

    // ----- users -----
    case "wallet_zero": return zeroWallet(id, f("currency"), f("reason"), actor());
    case "bal_adjust": return adjustBalance(id, f("currency"), Number(f("amount")), f("reason"), actor());
    case "ban": case "unban": case "unlock": case "noavatar": case "resetpw": case "delete": {
      const u = await first(`SELECT * FROM users WHERE id = $1`, [id]);
      if (!u) return "المستخدم غير موجود";
      await audit(run, actor(), "user_" + act, "user", id, { username: u.username });
      if (act === "ban") { await run(`UPDATE users SET status = 'banned' WHERE id = $1`, [id]); await run(`DELETE FROM tokens WHERE user_id = $1`, [id]); await run(`DELETE FROM push_tokens WHERE user_id = $1`, [id]); return `تم حظر ${u.username}`; }
      if (act === "unban") { await run(`UPDATE users SET status = 'active' WHERE id = $1`, [id]); return `تم رفع الحظر عن ${u.username}`; }
      if (act === "unlock") { await run(`UPDATE users SET failed = 0, locked_until = 0 WHERE id = $1`, [id]); return `تم فتح قفل ${u.username}`; }
      if (act === "noavatar") { await run(`UPDATE users SET avatar = NULL WHERE id = $1`, [id]); return `تم حذف صورة ${u.username}`; }
      if (act === "resetpw") {
        const tmp = rnd(5);
        await run(`UPDATE users SET password_hash = $1, failed = 0, locked_until = 0 WHERE id = $2`, [await Bun.password.hash(tmp), id]);
        await run(`DELETE FROM tokens WHERE user_id = $1`, [id]);
        return `كلمة مرور مؤقتة لـ ${u.username} (تظهر مرة واحدة): ${tmp}`;
      }
      const bal = await first(`SELECT COALESCE(SUM(amount),0) s FROM user_wallets WHERE user_id = $1`, [id]);
      if (num(bal?.s) > 0) return "لا يمكن حذف مستخدم لديه رصيد. صفّر الرصيد أولًا أو احظره بدل الحذف.";
      for (const q of [`DELETE FROM tokens WHERE user_id = $1`, `DELETE FROM resets WHERE user_id = $1`, `DELETE FROM push_tokens WHERE user_id = $1`, `DELETE FROM users WHERE id = $1`]) await run(q, [id]);
      return `تم حذف ${u.username}`;
    }

    // ----- support & settings -----
    case "support_reply": {
      const uid = Number(f("uid")), body = f("body").trim().slice(0, 1000);
      if (!(uid > 0) || !body) return "اكتب الرد";
      await run(`INSERT INTO messages (user_id, sender, body, seen, created_at) VALUES ($1,'admin',$2,0,$3)`, [uid, body, t]);
      await run(`UPDATE messages SET seen = 1 WHERE user_id = $1 AND sender = 'user'`, [uid]);
      await audit(run, actor(), "support_reply", "user", uid, {});
      await sendPush(uid);
      return "تم إرسال الرد";
    }
    case "push_send": return pushSend(f);
    case "force_update": { await putSet("force_update", String(Date.now())); await putSet("force_update_by", actor()); return "تم إرسال أمر التحديث الإجباري لجميع المستخدمين"; }
    case "set_save":
      await putSet("maint_on", bool(f("maint_on")) ? "1" : "0"); await putSet("maint_msg", f("maint_msg").trim().slice(0, 300));
      await putSet("banner_on", bool(f("banner_on")) ? "1" : "0"); await putSet("banner_text", f("banner_text").trim().slice(0, 300));
      await putSet("upd_version", f("upd_version").trim().slice(0, 20)); await putSet("upd_url", f("upd_url").trim().slice(0, 500)); await putSet("upd_notes", f("upd_notes").trim().slice(0, 300)); await putSet("upd_force", bool(f("upd_force")) ? "1" : "0");
      return "تم حفظ الإعدادات";
  }
  return "";
}
