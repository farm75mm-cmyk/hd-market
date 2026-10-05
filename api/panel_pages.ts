// Admin panel: page renderers (each returns the page title + body HTML).
import { run, first, count, num, nowS, h, CURRENCIES, getRates, getSet, STATUS_AR, FLOW, toUsdt, r4 } from "./core";
import { IMG, imgUrl, optPrice } from "./shop";
import { Ctx, ic, tile, tabTile, TAB_LABEL, fmtT, money, usdtFmt, picker, field, statusChip, PICK_JS, LIVE_JS } from "./panel_ui";

export type Page = { title: string; body: string; js?: string };
const ORDER_AR: Record<string, string> = { new: "جديد", processing: "قيد التنفيذ", done: "مكتمل", cancelled: "ملغي" };
const KIND_AR: Record<string, string> = { tool: "أدوات", opt: "منتجات اختياري", farm: "مزرعة", code: "كود اشتراك", random: "صندوق عشوائي" };
const PER = 30;

const pager = (ctx: Ctx, total: number, page: number, per = PER) => {
  const pages = Math.max(1, Math.ceil(total / per)); if (pages < 2) return "";
  const u = new URL(ctx.url.toString());
  return `<div class="pg">${Array.from({ length: Math.min(pages, 40) }, (_, i) => { u.searchParams.set("pg", String(i + 1)); return `<a class="${i + 1 === page ? "on" : ""}" href="${u.pathname}${u.search}">${i + 1}</a>`; }).join("")}</div>`;
};
const pageNo = (ctx: Ctx) => Math.max(1, Number(ctx.url.searchParams.get("pg")) || 1);
const chips = (ctx: Ctx, key: string, list: [string, string][], cur: string) => {
  const u = new URL(ctx.url.toString());
  return `<div class="tabs">${list.map(([k, l]) => { u.searchParams.set(key, k); u.searchParams.delete("pg"); return `<a class="${cur === k ? "on" : ""}" href="${u.pathname}${u.search}">${h(ctx.t(l))}</a>`; }).join("")}</div>`;
};
const searchBox = (ctx: Ctx, q: string, ph: string) => `<form method="get" class="row" style="margin-bottom:12px"><input type="hidden" name="tab" value="${ctx.tab}"><input type="search" class="grow" name="q" value="${h(q)}" placeholder="${h(ctx.t(ph))}"><button>${h(ctx.t("بحث"))}</button></form>`;
const sw = (name: string, label: string, on: boolean) => `<label class="row" style="gap:6px"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}> ${h(label)}</label>`;
const priceTxt = (usdt: any) => `${usdtFmt(usdt)} USDT`;

// ---------- orders ----------
async function ordersList(ctx: Ctx, where: string, params: any[], opts: { deliverFocus?: boolean } = {}) {
  const { t, F, hid } = ctx; const pg = pageNo(ctx);
  const total = await count(`SELECT COUNT(*) c FROM orders o WHERE ${where}`, params);
  const rows = await run(`SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE ${where} ORDER BY o.id DESC LIMIT ${PER} OFFSET ${(pg - 1) * PER}`, params);
  const rt = await getRates();
  let out = "";
  for (const o of rows) {
    let lines: any[] = []; try { lines = o.lines ? JSON.parse(o.lines) : []; } catch {}
    const usdt = num(o.usdt) || toUsdt(num(o.total), o.currency ?? "JOD", rt);
    const pending = ["new", "processing"].includes(o.status);
    const tagHtml = o.farm_tag ? `<div class="sm" dir="ltr" style="text-align:right"><b>Tag:</b> #${h(o.farm_tag)} · ${h(t("سعة المخزن"))}: ${num(o.farm_cap)}</div>` : "";
    const lineHtml = tagHtml + (lines.length ? `<details><summary>${h(t("تفاصيل الطلب"))} (${lines.length})</summary><div class="sm" style="margin-top:6px">${lines.map((l) => `<div>${h(l.n)} × ${num(l.q)}${l.prize ? ` → <b>${h(l.prize)}</b>` : ""}</div>`).join("")}</div></details>` : "");
    const act: string[] = [];
    if (pending) {
      if (o.kind === "farm" || o.kind === "random") act.push(F("order_deliver", `${hid("id", o.id)}<div class="row"><input type="text" name="note" placeholder="${h(t("ملاحظة للمشتري (اختياري)"))}" style="min-width:150px"><button class="y">${h(t("تسليم"))}</button></div>`, `&st=${h(ctx.url.searchParams.get("st") ?? "")}`));
      if (o.kind !== "code") {
        act.push(F("order_status", `${hid("id", o.id)}${hid("status", o.status === "new" ? "processing" : "done")}<button class="g">${h(t(o.status === "new" ? "قيد التنفيذ" : "تم الإنجاز"))}</button>`));
        act.push(F("order_status", `${hid("id", o.id)}${hid("status", "cancelled")}<button class="r" onclick="return confirm('${h(t("إلغاء الطلب وإرجاع المبلغ للمستخدم؟"))}')">${h(t("إلغاء وإرجاع"))}</button>`));
      }
    }
    out += `<div class="item"><div class="hd"><div><b>#${num(o.id)} · ${h(o.product_name)}</b> ${statusChip(o.status, t(ORDER_AR[o.status] ?? o.status))} <span class="chip">${h(t(KIND_AR[o.kind] ?? o.kind))}</span><br>
      <span class="sm">${h(o.username ?? "—")} (ID ${num(o.user_id)}) · ${num(o.qty)} ${h(t("قطعة"))} · <b dir="ltr">${money(o.total)} ${h(o.currency)}</b> ≈ ${priceTxt(usdt)} · ${fmtT(o.created_at)}</span></div></div>
      ${lineHtml}${o.delivery ? `<div class="mono sm" style="background:#f5f6fa;border-radius:10px;padding:8px 10px;margin-top:8px;white-space:pre-wrap">${h(o.delivery)}</div>` : ""}
      ${act.length ? `<div class="acts">${act.join("")}</div>` : ""}</div>`;
  }
  if (!rows.length) out += `<div class="box" style="text-align:center;color:#6b7488">${h(t("لا توجد طلبات."))}</div>`;
  return out + pager(ctx, total, pg);
}
const ST_FILTERS: [string, string][] = [["pending", "تنتظر"], ["done", "مكتمل"], ["cancelled", "ملغي"], ["all", "الكل"]];
function stWhere(ctx: Ctx, base: string, params: any[]) {
  const st = ctx.url.searchParams.get("st") ?? "pending";
  let w = base;
  if (st === "pending") w += ` AND o.status IN ('new','processing')`; else if (st === "done" || st === "cancelled") { w += ` AND o.status = $${params.length + 1}`; params.push(st); }
  return { w, st };
}
async function ordersPage(ctx: Ctx, kind: string, title: string, intro = ""): Promise<Page> {
  const params: any[] = [kind]; const { w, st } = stWhere(ctx, "o.kind = $1", params);
  return { title: ctx.t(title), body: `${intro ? `<p class="hint">${h(ctx.t(intro))}</p>` : ""}${chips(ctx, "st", ST_FILTERS, st)}${await ordersList(ctx, w, params)}` };
}

// ---------- dashboard ----------
async function dashboard(ctx: Ctx): Promise<Page> {
  const { t } = ctx;
  const pending = await count(`SELECT COUNT(*) c FROM orders WHERE status IN ('new','processing') AND kind <> 'code'`);
  const farmsSold = await count(`SELECT COUNT(*) c FROM farms WHERE sold = 1`);
  const rt = await getRates();
  let sales = num((await first(`SELECT COALESCE(SUM(usdt),0) s FROM orders WHERE status = 'done' AND usdt > 0`))?.s);
  for (const r of await run(`SELECT currency, SUM(total) s FROM orders WHERE status = 'done' AND usdt = 0 GROUP BY currency`)) sales += toUsdt(num(r.s), r.currency ?? "JOD", rt);
  const users = await count(`SELECT COUNT(*) c FROM users`);
  const dep = await count(`SELECT COUNT(*) c FROM deposit_orders WHERE status IN ('proof_sent','amount_mismatch')`);
  const sup = await count(`SELECT COUNT(*) c FROM messages WHERE sender = 'user' AND seen = 0`);
  const today = Math.floor(nowS() / 86400) * 86400;
  const newToday = await count(`SELECT COUNT(*) c FROM users WHERE created_at >= $1`, [today]);
  const card = (tab: string, n: string, label: string) => `<div class="card">${tabTile(tab, 56)}<b>${n}</b><small>${h(t(label))}</small></div>`;
  const ql = (tab: string) => `<a class="ql" href="/admin?tab=${tab}">${tabTile(tab, 52)}<span>${h(t(TAB_LABEL[tab]))}</span></a>`;
  const days: [string, number][] = [];
  for (let i = 13; i >= 0; i--) { const from = today - i * 86400, d = new Date(from * 1000); days.push([`${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`, await count(`SELECT COUNT(*) c FROM users WHERE created_at >= $1 AND created_at < $2`, [from, from + 86400])]); }
  const mx = Math.max(1, ...days.map((d) => d[1]));
  return {
    title: t("لوحة الإدارة"),
    body: `<div class="cards">${card("farm_delivery", String(pending), "طلبات بانتظار التسليم")}${card("farms", String(farmsSold), "المزارع المباعة")}${card("rates", sales.toFixed(2), "المبيعات المكتملة (USDT)")}</div>
    <div class="mini"><div><b>${users}</b><small>${h(t("المستخدمون"))}</small></div><div><b>${newToday}</b><small>${h(t("سجّلوا اليوم"))}</small></div><div><b>${dep}</b><small>${h(t("طلبات شحن تنتظر"))}</small></div><div><b>${sup}</b><small>${h(t("رسائل دعم جديدة"))}</small></div></div>
    ${["opt_orders", "farm_delivery", "deposits", "opt_prices", "codes", "tool_orders", "users", "support"].map(ql).join("")}
    <div class="box"><h2>${h(t("التسجيلات آخر 14 يومًا"))}</h2><div class="bars" dir="ltr">${days.map(([, n]) => `<div style="height:${Math.max(3, Math.round((n / mx) * 100))}%"><span>${n}</span></div>`).join("")}</div><div class="lbl" dir="ltr">${days.map(([d]) => `<span>${d}</span>`).join("")}</div></div>`,
  };
}

// ---------- wallet pages ----------
async function depositsPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx; const pg = pageNo(ctx);
  const sf = ctx.url.searchParams.get("st") ?? "active";
  const ACTIVE = ["proof_sent", "under_review", "verifying", "amount_mismatch", "awaiting_payment"];
  const filters: [string, string][] = [["active", "تحتاج إجراء"], ["all", "الكل"]];
  const where = sf === "all" ? "1=1" : `d.status IN (${ACTIVE.map((x) => `'${x}'`).join(",")})`;
  const total = await count(`SELECT COUNT(*) c FROM deposit_orders d WHERE ${where}`);
  const rows = await run(`SELECT d.*, u.username FROM deposit_orders d LEFT JOIN users u ON u.id = d.user_id WHERE ${where} ORDER BY d.id DESC LIMIT ${PER} OFFSET ${(pg - 1) * PER}`);
  let out = chips(ctx, "st", filters, sf);
  const ex = `&st=${h(sf)}`;
  for (const d of rows) out += await depositCard(ctx, d, ex);
  if (!rows.length) out += `<div class="box" style="text-align:center;color:#6b7488">${h(t("لا توجد طلبات."))}</div>`;
  return { title: t("طلبات الشحن"), body: out + pager(ctx, total, pg) };
}
async function depositCard(ctx: Ctx, d: any, ex: string, withProof = true) {
  const { t, F, hid } = ctx;
  const proof = withProof ? await first(`SELECT image FROM payment_proofs WHERE order_id = $1`, [d.id]) : undefined;
  const hist = await run(`SELECT * FROM status_history WHERE order_id = $1 ORDER BY id`, [d.id]);
  const next = FLOW[d.status] ?? [];
  const btns: string[] = [];
  if (next.includes("under_review")) btns.push(F("dep_move", `${hid("id", d.id)}${hid("to", "under_review")}<button class="g">${h(t("قيد المراجعة"))}</button>`, ex));
  if (next.includes("verifying")) btns.push(F("dep_move", `${hid("id", d.id)}${hid("to", "verifying")}<button class="g">${h(t("قيد التحقق"))}</button>`, ex));
  if (next.includes("amount_mismatch")) btns.push(F("dep_mismatch", `${hid("id", d.id)}<div class="row"><input type="number" step="any" min="0" name="paid" placeholder="${h(t("المبلغ المدفوع فعليًا"))}" required style="width:150px"><button class="g">${h(t("مبلغ غير مطابق"))}</button></div>`, ex));
  if (next.includes("approved")) {
    btns.push(F("dep_approve", `${hid("id", d.id)}${hid("use", "requested")}<button class="y" onclick="return confirm('${h(t("اعتماد وإضافة"))} ${num(d.amount)} ${h(d.currency)}؟')">${d.status === "amount_mismatch" ? `${h(t("اعتماد بالمبلغ المطلوب"))} (${num(d.amount)})` : h(t("اعتماد وإضافة الرصيد"))}</button>`, ex));
    if (d.status === "amount_mismatch" && d.paid_amount != null) btns.push(F("dep_approve", `${hid("id", d.id)}${hid("use", "paid")}<button class="y" onclick="return confirm('${h(t("اعتماد وإضافة"))} ${num(d.paid_amount)} ${h(d.currency)}؟')">${h(t("اعتماد بالمبلغ المدفوع"))} (${num(d.paid_amount)})</button>`, ex));
  }
  if (next.includes("rejected")) btns.push(F("dep_reject", `${hid("id", d.id)}<div class="row"><input type="text" name="note" class="grow" placeholder="${h(t("سبب الرفض (مطلوب)"))}" required><button class="r">${h(t("رفض"))}</button></div>`, ex));
  if (next.includes("cancelled")) btns.push(F("dep_cancel", `${hid("id", d.id)}<button class="g" onclick="return confirm('${h(t("إلغاء الطلب؟"))}')">${h(t("إلغاء"))}</button>`, ex));
  if (next.includes("reversed")) btns.push(F("dep_reverse", `${hid("id", d.id)}<div class="row"><input type="text" name="note" class="grow" placeholder="${h(t("سبب العكس (مطلوب)"))}" required><button class="r" onclick="return confirm('${h(t("عكس العملية وخصم المبلغ من رصيد المستخدم؟"))}')">${h(t("عكس العملية"))}</button></div>`, ex));
  return `<div class="item"><div class="hd">${proof ? `<img class="rc" style="width:110px;height:110px" src="${h(proof.image)}" alt="proof" onclick="this.style.width=this.style.width==='110px'?'100%':'110px';this.style.height=this.style.width==='100%'?'auto':'110px'">` : ""}<div>
    <b class="mono">${h(d.txn_id)}</b> ${statusChip(d.status, t(STATUS_AR[d.status] ?? d.status))}<br>
    <b>${h(d.username ?? "—")}</b> (ID ${num(d.user_id)}) · <b dir="ltr">${money(d.amount)} ${h(d.currency)}</b><br>
    <span class="sm">${h(t("الطريقة"))}: ${h(d.method_name)} · ${h(t("سعر الصرف المثبّت"))}: 1 USDT = ${num(d.rate_usdt)} ${h(d.currency)}</span><br>
    <span class="sm">${fmtT(d.created_at)} → ${fmtT(d.updated_at)} · ${h(t("ينتهي"))}: ${fmtT(d.expires_at)}</span>
    ${d.paid_amount != null ? `<br><span class="sm" style="color:#b71c1c">${h(t("المطلوب"))} ${num(d.amount)} · ${h(t("المدفوع"))} ${num(d.paid_amount)} · ${h(t("الفرق"))} ${r4(num(d.paid_amount) - num(d.amount))} ${h(d.currency)}</span>` : ""}
    ${d.balance_after != null ? `<br><span class="sm">${h(t("الرصيد قبل"))}: ${num(d.balance_before)} · ${h(t("بعد"))}: ${num(d.balance_after)} · ${h(d.admin_actor ?? "—")}</span>` : ""}
    ${d.reject_reason ? `<br><span class="sm">${h(t("السبب"))}: ${h(d.reject_reason)}</span>` : ""}
    <details><summary>${h(t("سجل تغيّر الحالة"))} (${hist.length})</summary>${hist.map((x) => `<div class="sm">${fmtT(x.created_at)} · ${h(t(STATUS_AR[x.from_status] ?? "—"))} ← <b>${h(t(STATUS_AR[x.to_status] ?? x.to_status))}</b> · ${h(x.actor)}${x.note ? " · " + h(x.note) : ""}</div>`).join("")}</details></div></div>
    ${btns.length ? `<div class="acts" style="flex-direction:column;align-items:stretch">${btns.join("")}</div>` : ""}</div>`;
}
async function depositHistory(ctx: Ctx): Promise<Page> {
  const { t } = ctx; const pg = pageNo(ctx), q = (ctx.url.searchParams.get("q") ?? "").trim();
  const sf = ctx.url.searchParams.get("st") ?? "all";
  const done = ["credited", "rejected", "cancelled", "expired", "reversed"];
  const params: any[] = []; let where = `d.status IN (${done.map((x) => `'${x}'`).join(",")})`;
  if (done.includes(sf)) { params.push(sf); where = `d.status = $1`; }
  if (q) { params.push(`%${q.toLowerCase()}%`); where += ` AND (LOWER(d.txn_id) LIKE $${params.length} OR LOWER(u.username) LIKE $${params.length})`; }
  const total = await count(`SELECT COUNT(*) c FROM deposit_orders d LEFT JOIN users u ON u.id = d.user_id WHERE ${where}`, params);
  const rows = await run(`SELECT d.*, u.username FROM deposit_orders d LEFT JOIN users u ON u.id = d.user_id WHERE ${where} ORDER BY d.id DESC LIMIT ${PER} OFFSET ${(pg - 1) * PER}`, params);
  let out = chips(ctx, "st", [["all", "الكل"], ...done.map((x) => [x, STATUS_AR[x]] as [string, string])], sf) + searchBox(ctx, q, "ابحث برقم العملية أو اسم المستخدم");
  for (const d of rows) out += await depositCard(ctx, d, "", false);
  if (!rows.length) out += `<div class="box" style="text-align:center;color:#6b7488">${h(t("لا توجد إيداعات."))}</div>`;
  return { title: t("الإيداعات (السابقة)"), body: out + pager(ctx, total, pg) };
}
async function methodsPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  const optc = (sel: string) => CURRENCIES.map((c) => `<option${c === sel ? " selected" : ""}>${c}</option>`).join("");
  const form = (m: any) => F("method_save", `${m ? hid("id", m.id) : ""}<div class="fg">${field(t("اسم الطريقة"), `<input type="text" class="w" name="name" value="${h(m?.name ?? "")}" required>`)}${field(t("العملة"), `<select name="currency" class="w">${optc(m?.currency ?? "JOD")}</select>`)}${field(t("أدنى مبلغ"), `<input type="number" class="w" step="any" min="0" name="min_amount" value="${m ? num(m.min_amount) : ""}">`)}${field(t("أعلى مبلغ (0 = بلا حد)"), `<input type="number" class="w" step="any" min="0" name="max_amount" value="${m ? num(m.max_amount) : ""}">`)}${field(t("مدة الصلاحية (دقيقة)"), `<input type="number" class="w" min="1" name="expiry_minutes" value="${m ? num(m.expiry_minutes) : 60}">`)}</div>
    <div class="fg">${field(t("معلومات الدفع (رقم / عنوان المحفظة)"), `<input type="text" class="w mono" name="info" value="${h(m?.info ?? "")}" required>`)}${field(t("تعليمات الدفع"), `<input type="text" class="w" name="instructions" value="${h(m?.instructions ?? "")}">`)}</div>
    <div class="row">${sw("active", t("مفعّلة"), !m || !!num(m.active))}${picker(m ? imgUrl("m", m) : null)}<button class="${m ? "" : "y"}">${h(t(m ? "حفظ" : "إضافة"))}</button></div>`);
  let out = `<div class="box"><h2>${h(t("إضافة طريقة دفع"))}</h2>${form(null)}</div>`;
  for (const m of await run(`SELECT *, ${IMG("icon")} FROM payment_methods ORDER BY id`)) {
    out += `<div class="item">${form(m)}<div class="acts">${F("method_toggle", `${hid("id", m.id)}<button class="g">${h(t(num(m.active) ? "تعطيل مؤقت" : "تفعيل"))}</button>`)}${F("method_del", `${hid("id", m.id)}<button class="r" onclick="return confirm('${h(t("حذف الطريقة؟ إن كانت مرتبطة بعمليات مالية فسيتم تعطيلها فقط."))}')">${h(t("حذف"))}</button>`)}${statusChip(num(m.active) ? "ok" : "bad", t(num(m.active) ? "مفعّلة" : "معطّلة"))}</div></div>`;
  }
  return { title: t("طرق الدفع"), body: out, js: PICK_JS };
}
async function ratesPage(ctx: Ctx): Promise<Page> {
  const { t, F } = ctx; const rt = await getRates();
  const hist = await run(`SELECT * FROM exchange_rate_history ORDER BY id DESC LIMIT 60`);
  return { title: t("أسعار العملات"), body: `<div class="box"><h2>${h(t("أسعار الصرف"))}</h2><p class="hint">${h(t("أسعار المنتجات كلها بالـ USDT. عند الشراء أو الشحن بعملة أخرى يُحوَّل المبلغ بهذه الأسعار. كل طلب شحن يثبّت السعر وقت إنشائه فلا يتغير إن عدّلت السعر لاحقًا. القيم الافتراضية أولية — راجعها."))}</p>
    ${F("rate_save", `<div class="fg"><div><label class="f">1 USDT = ? JOD</label><input type="number" class="w" step="any" min="0" name="rate_JOD" value="${rt.JOD}"></div><div><label class="f">1 USDT = ? IQD</label><input type="number" class="w" step="any" min="0" name="rate_IQD" value="${rt.IQD}"></div></div><button class="y">${h(t("حفظ الأسعار"))}</button>`)}</div>
    <div class="box"><h2>${h(t("سجل تعديل الأسعار"))}</h2><div class="scroll"><table><tr><th>${h(t("العملة"))}</th><th>${h(t("من"))}</th><th>${h(t("إلى"))}</th><th>${h(t("المسؤول"))}</th><th>${h(t("التاريخ"))}</th></tr>${hist.map((x) => `<tr><td>${h(x.currency)}</td><td>${x.old_rate == null ? "—" : num(x.old_rate)}</td><td>${num(x.new_rate)}</td><td>${h(x.actor)}</td><td>${fmtT(x.created_at)}</td></tr>`).join("") || `<tr><td colspan="5" class="sm">${h(t("لا توجد تعديلات بعد."))}</td></tr>`}</table></div></div>` };
}
async function ledgerPage(ctx: Ctx): Promise<Page> {
  const { t } = ctx; const pg = pageNo(ctx); const per = 50;
  const total = await count(`SELECT COUNT(*) c FROM transactions`);
  const rows = await run(`SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT ${per} OFFSET ${(pg - 1) * per}`);
  return { title: t("سجل المحفظة الآمن"), body: `<div class="box"><h2>${h(t("السجل المالي (للقراءة فقط · لا يمكن حذفه)"))}</h2><div class="scroll"><table><tr><th>Transaction ID</th><th>${h(t("المستخدم"))}</th><th>${h(t("النوع"))}</th><th>${h(t("المبلغ"))}</th><th>${h(t("قبل"))}</th><th>${h(t("بعد"))}</th><th>${h(t("المرجع"))}</th><th>${h(t("المنفّذ"))}</th><th>${h(t("التاريخ"))}</th></tr>${rows.map((x) => `<tr><td class="mono">${h(x.txn_id)}</td><td>${h(x.username ?? "—")} (${num(x.user_id)})</td><td>${h(x.type)}</td><td dir="ltr" style="color:${num(x.amount) < 0 ? "#b71c1c" : "#1b6b3a"}">${money(x.amount)} ${h(x.currency)}</td><td>${money(x.balance_before)}</td><td>${money(x.balance_after)}</td><td class="mono">${h(x.ref_txn_id ?? "")}</td><td>${h(x.actor ?? "")}</td><td>${fmtT(x.created_at)}</td></tr>`).join("")}</table></div>${pager(ctx, total, pg, per)}</div>` };
}
async function auditPage(ctx: Ctx): Promise<Page> {
  const { t } = ctx; const pg = pageNo(ctx); const per = 50;
  const total = await count(`SELECT COUNT(*) c FROM audit_logs`);
  const rows = await run(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ${per} OFFSET ${(pg - 1) * per}`);
  return { title: t("سجل الإجراءات"), body: `<div class="box"><h2>${h(t("سجل الإجراءات (للقراءة فقط · لا يمكن حذفه)"))}</h2><div class="scroll"><table><tr><th>#</th><th>${h(t("التاريخ"))}</th><th>${h(t("المنفّذ"))}</th><th>${h(t("الإجراء"))}</th><th>${h(t("الكيان"))}</th><th>${h(t("تفاصيل"))}</th></tr>${rows.map((x) => `<tr><td>${num(x.id)}</td><td>${fmtT(x.created_at)}</td><td>${h(x.actor)}</td><td>${h(x.action)}</td><td class="mono">${h(x.entity)} ${h(x.entity_id)}</td><td class="mono sm" style="max-width:340px">${h(x.details)}</td></tr>`).join("")}</table></div>${pager(ctx, total, pg, per)}</div>` };
}

// ---------- store pages ----------
async function categoriesPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid, url } = ctx;
  const sp = url.searchParams, catId = Number(sp.get("cat")) || 0;
  const cats = await run(`SELECT id, name, name_en, sort, active, ${IMG()} FROM categories ORDER BY sort, id`);
  const back = (title: string) => `<div class="lh"><a class="bk" href="/admin?tab=categories" aria-label="back">${ic("chevR", 22)}</a><h2>${h(title)}</h2></div>`;
  const cat = cats.find((c: any) => Number(c.id) === catId);
  if (cat) {
    const prods = await run(`SELECT id, category_id, name, price, qty, max_order, need_tag, active, descr, ${IMG()} FROM products WHERE kind = 'tool' AND category_id = $1 ORDER BY id LIMIT 300`, [cat.id]);
    const psheet = (p: any) => {
      const img = p ? imgUrl("p", p) : null;
      const form = F("prod_save", `${p ? hid("id", p.id) : ""}${hid("category_id", cat.id)}<input type="hidden" name="remove_image" value="">
        <label class="bigimg"><img class="th" ${img ? `src="${h(img)}"` : 'style="visibility:hidden"'} alt=""><span class="cam">${ic("camera", 20)}</span><input type="hidden" name="image" value=""><input class="pick" type="file" accept="image/*" hidden></label>
        <button type="button" class="gb" onclick="var f=this.form;f.remove_image.value=1;f.image.value='';f.querySelector('img.th').style.visibility='hidden'">${h(t("إزالة الصورة"))} ${ic("trash", 18)}</button>
        ${field(t("الاسم"), `<input type="text" class="w" name="name" value="${h(p?.name ?? "")}" required>`)}
        ${field(t("الوصف"), `<textarea class="w" name="descr" rows="2">${h(p?.descr ?? "")}</textarea>`)}
        ${field(t("السعر (USDT)"), `<input type="number" class="w" step="any" min="0" name="price" value="${p ? num(p.price) : ""}" required>`)}
        ${field(t("الكمية المتوفرة (اتركه فارغاً = غير محدود)"), `<input type="number" class="w" min="0" name="qty" placeholder="${h(t("غير محدود"))}" value="${p && num(p.qty) >= 0 ? num(p.qty) : ""}">`)}
        <label class="tgr"><span>${h(t("يتطلب إدخال Tag المزرعة وسعة المخزن"))}</span><input class="tg" type="checkbox" name="need_tag" value="1"${p && num(p.need_tag) ? " checked" : ""}></label>
        ${field(t("الحد الأقصى لكل Tag (اتركه فارغاً = بدون حد)"), `<input type="number" class="w" min="0" name="max_order" placeholder="${h(t("بدون حد"))}" value="${p && num(p.max_order) > 0 ? num(p.max_order) : ""}">`)}
        <label class="tgr"><span>${h(t("ظاهر للمستخدمين"))}</span><input class="tg" type="checkbox" name="active" value="1"${!p || num(p.active) ? " checked" : ""}></label>
        <button class="k">${h(t("حفظ"))}</button>`, `&cat=${cat.id}`);
      const del = p ? F("prod_del", `${hid("id", p.id)}<button class="gb rd" onclick="return confirm('${h(t("حذف المنتج؟"))}')">${h(t("حذف"))} ${ic("trash", 18)}</button>`, `&cat=${cat.id}`) : "";
      return `<div class="shw" id="p_${p ? p.id : "new"}" hidden><div class="shb" data-close="1"></div><div class="shs"><i class="grip"></i><h2>${h(p ? p.name : t("إضافة منتج"))}</h2>${form}${del}</div></div>`;
    };
    let rows = "", sheets = psheet(null);
    for (const p of prods) {
      const img = imgUrl("p", p);
      rows += `<a class="lr" href="#" data-sh="p_${p.id}">${img ? `<img class="li" src="${h(img)}" alt="">` : `<span class="li">${tabTile("categories", 62)}</span>`}<span class="lt"><b>${h(p.name)}</b><small dir="ltr" style="text-align:right">${usdtFmt(num(p.price))} USDT · ${num(p.qty) < 0 ? "∞" : num(p.qty)}${num(p.active) ? "" : " · " + h(t("مخفي"))}</small></span>${ic("chevL", 20)}</a>`;
      sheets += psheet(p);
    }
    const js = PICK_JS + `<script>document.addEventListener("click",function(e){var a=e.target.closest("[data-sh]");if(a){e.preventDefault();document.getElementById(a.dataset.sh).hidden=false;document.body.style.overflow="hidden";return}if(e.target.dataset&&e.target.dataset.close){var w=e.target.closest(".shw");w.hidden=true;document.body.style.overflow=""}});</script>`;
    return { title: t("أقسام المتجر والأدوات"), body: `<div class="lh"><a class="bk" href="/admin?tab=categories" aria-label="back">${ic("chevR", 22)}</a><h2>${h(t("إدارة عناصر القسم"))}</h2><a class="plus" href="#" data-sh="p_new" aria-label="add">${ic("plus", 26)}</a></div>` + (rows ? `<div class="lc">${rows}</div>` : `<div class="box" style="text-align:center;color:#6b7488">${h(t("لا توجد عناصر في هذا القسم."))}</div>`) + sheets, js };
  }
  // list view
  const cnt = async (q: string) => await count(q);
  const sheet = (c: any) => {
    const img = c ? imgUrl("c", c) : null;
    const form = F("cat_save", `${c ? hid("id", c.id) : ""}<input type="hidden" name="remove_image" value="">
      <label class="bigimg"><img class="th" ${img ? `src="${h(img)}"` : 'style="visibility:hidden"'} alt=""><span class="cam">${ic("camera", 20)}</span><input type="hidden" name="image" value=""><input class="pick" type="file" accept="image/*" hidden></label>
      <p class="hint" style="text-align:right">${h(t("اضغط على الصورة لتغييرها — تظهر في واجهة المتجر"))}</p>
      <button type="button" class="gb" onclick="var f=this.form;f.remove_image.value=1;f.image.value='';f.querySelector('img.th').style.visibility='hidden'">${h(t("إزالة الصورة"))} ${ic("trash", 18)}</button>
      ${field(t("الاسم بالعربية"), `<input type="text" class="w" name="name" value="${h(c?.name ?? "")}" required>`)}
      ${field(t("الاسم بالإنجليزية"), `<input type="text" class="w" name="name_en" value="${h(c?.name_en ?? "")}" dir="ltr" style="text-align:left">`)}
      ${field(t("الترتيب (رقم أصغر = أعلى)"), `<input type="number" class="w" name="sort" value="${c ? num(c.sort) : cats.length + 1}">`)}
      <label class="tgr"><span>${h(t("ظاهر للمستخدمين"))}</span><input class="tg" type="checkbox" name="active" value="1"${!c || num(c.active) ? " checked" : ""}></label>
      <button class="k">${h(t("حفظ"))}</button>`, "");
    const extra = c ? `<a class="gb" href="/admin?tab=categories&cat=${c.id}">${h(t("إدارة محتوى القسم"))} ${ic("box", 18)}</a>${F("cat_del", `${hid("id", c.id)}<button class="gb rd" onclick="return confirm('${h(t("حذف القسم وكل منتجاته؟"))}')">${h(t("حذف"))} ${ic("trash", 18)}</button>`, "")}` : "";
    return `<div class="shw" id="s_${c ? c.id : "new"}" hidden><div class="shb" data-close="1"></div><div class="shs"><i class="grip"></i><h2>${h(c ? c.name : t("إضافة قسم"))}</h2>${form}${extra}</div></div>`;
  };
  const row = (href: string, img: string, title: string, sub: string, sh = "") => `<a class="lr" href="${href}"${sh ? ` data-sh="${sh}"` : ""}>${img}<span class="lt"><b>${h(title)}</b><small>${h(sub)}</small></span>${ic("chevL", 20)}</a>`;
  const tileImg = (tab: string) => `<span class="li">${tabTile(tab, 62)}</span>`;
  let rows = row("/admin?tab=farms", tileImg("farms"), t("المزارع") + " · Farms", `${await cnt(`SELECT COUNT(*) c FROM farms WHERE active = 1 AND sold = 0`)} ${t("عنصر")}`);
  let sheets = sheet(null);
  for (const c of cats) {
    const n = await cnt(`SELECT COUNT(*) c FROM products WHERE kind = 'tool' AND category_id = ${Number(c.id)}`);
    const img = imgUrl("c", c);
    rows += row(`/admin?tab=categories&cat=${c.id}`, img ? `<img class="li" src="${h(img)}" alt="">` : tileImg("categories"), c.name_en ? `${c.name_en} · ${c.name}` : c.name, `${n} ${t("عنصر")}${num(c.active) ? "" : " · " + t("مخفي")}`, `s_${c.id}`);
    sheets += sheet(c);
  }
  rows += row("/admin?tab=opt_prices", tileImg("opt_prices"), t("منتجات اختياري"), `${await cnt(`SELECT COUNT(*) c FROM opt_items WHERE active = 1`)} ${t("عنصر")}`);
  rows += row("/admin?tab=codes", tileImg("codes"), t("أكواد الاشتراك"), `${await cnt(`SELECT COUNT(*) c FROM sub_codes WHERE status = 'available'`)} ${t("عنصر")}`);
  rows += row("/admin?tab=random", tileImg("random"), t("المنتجات العشوائية"), `${await cnt(`SELECT COUNT(*) c FROM random_boxes WHERE active = 1`)} ${t("عنصر")}`);
  const js = PICK_JS + `<script>document.addEventListener("click",function(e){var a=e.target.closest("[data-sh]");if(a){e.preventDefault();document.getElementById(a.dataset.sh).hidden=false;document.body.style.overflow="hidden";return}if(e.target.dataset&&e.target.dataset.close){var w=e.target.closest(".shw");w.hidden=true;document.body.style.overflow=""}});</script>`;
  return { title: t("أقسام المتجر والأدوات"), body: `<div class="lh"><h2>${h(t("أقسام المتجر"))}</h2><a class="plus" href="#" data-sh="s_new" aria-label="add">${ic("plus", 26)}</a></div><div class="lc">${rows}</div>${sheets}`, js };
}
async function farmsPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  const form = (f: any) => F("farm_save", `${f ? hid("id", f.id) : ""}<div class="fg">${field(t("اسم المزرعة"), `<input type="text" class="w" name="name" value="${h(f?.name ?? "")}" required>`)}${field(t("المستوى"), `<input type="number" class="w" min="0" name="level" value="${f ? num(f.level) : ""}">`)}${field(t("السعر (USDT)"), `<input type="number" class="w" step="any" min="0" name="price" value="${f ? num(f.price) : ""}" required>`)}</div>${field(t("وصف المزرعة (المستوى، المباني، الخ)"), `<textarea name="descr">${h(f?.descr ?? "")}</textarea>`)}<div class="row" style="margin-top:10px">${sw("active", t("ظاهرة للمستخدمين"), !f || !!num(f.active))}${picker(f ? imgUrl("f", f) : null)}<button class="${f ? "" : "y"}">${h(t(f ? "حفظ" : "إضافة"))}</button></div>`);
  let out = `<div class="box"><h2>${h(t("إضافة مزرعة"))}</h2>${form(null)}</div>`;
  for (const f of await run(`SELECT id, name, descr, level, price, active, sold, buyer_id, ${IMG()} FROM farms ORDER BY id DESC LIMIT 200`)) {
    const buyer = num(f.sold) ? await first(`SELECT username FROM users WHERE id = $1`, [f.buyer_id]) : null;
    out += `<div class="item"><div class="row" style="margin-bottom:8px">${num(f.sold) ? statusChip("done", `${t("مباعة")}: ${buyer?.username ?? f.buyer_id}`) : statusChip(num(f.active) ? "ok" : "bad", t(num(f.active) ? "متاحة" : "مخفية"))}</div>${form(f)}<div class="acts">${F("farm_del", `${hid("id", f.id)}<button class="r s" onclick="return confirm('${h(t("حذف المزرعة؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`;
  }
  return { title: t("المزارع"), body: out, js: PICK_JS };
}
async function farmDataPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  let out = `<p class="hint">${h(t("هذه البيانات سرية: تُرسل للمشتري فقط عند الضغط على «تسليم» في صفحة تسليم المزارع."))}</p>`;
  for (const f of await run(`SELECT id, name, sold, buyer_id, game_id, token FROM farms ORDER BY id DESC LIMIT 200`)) {
    out += `<div class="item"><b>${h(f.name)}</b> ${num(f.sold) ? statusChip("done", t("مباعة")) : statusChip("ok", t("متاحة"))} ${f.game_id || f.token ? statusChip("ok", t("البيانات مكتملة")) : statusChip("bad", t("بلا بيانات"))}
      ${F("farm_creds", `${hid("id", f.id)}<div class="fg" style="margin-top:10px">${field("ID", `<input type="text" class="w mono" name="game_id" value="${h(f.game_id ?? "")}" autocomplete="off">`)}${field("Token", `<input type="text" class="w mono" name="token" value="${h(f.token ?? "")}" autocomplete="off">`)}</div><button>${h(t("حفظ"))}</button>`)}</div>`;
  }
  if (!out.includes("item")) out += `<div class="box">${h(t("لا توجد مزارع. أضفها من صفحة «المزارع»."))}</div>`;
  return { title: t("بيانات المزارع (ID / Token)"), body: out };
}
async function optPricesPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx; const pg = pageNo(ctx), q = (ctx.url.searchParams.get("q") ?? "").trim(), per = 50;
  const dp = await optPrice();
  const params: any[] = []; let where = "1=1";
  if (q) { params.push(`%${q.toLowerCase()}%`); where = `(LOWER(name) LIKE $1 OR LOWER(building) LIKE $1)`; }
  const total = await count(`SELECT COUNT(*) c FROM opt_items WHERE ${where}`, params);
  const rows = await run(`SELECT * FROM opt_items WHERE ${where} ORDER BY id LIMIT ${per} OFFSET ${(pg - 1) * per}`, params);
  const custom = await count(`SELECT COUNT(*) c FROM opt_items WHERE price IS NOT NULL`);
  let out = `<div class="box"><h2>${h(t("السعر الافتراضي للقطعة الواحدة"))}</h2>${F("opt_price_save", `<div class="row"><input type="number" class="grow" step="any" min="0" name="price" value="${dp}" required><span class="sm">USDT</span><button class="y">${h(t("حفظ"))}</button></div>`)}<p class="hint" style="margin-top:8px">${h(t("يُطبَّق على كل المنتجات التي ليس لها سعر خاص."))} (${custom} ${h(t("سعر خاص"))})</p>${custom ? F("opt_reset", `<button class="g s" onclick="return confirm('${h(t("إزالة كل الأسعار الخاصة؟"))}')">${h(t("إزالة كل الأسعار الخاصة"))}</button>`) : ""}</div>${searchBox(ctx, q, "ابحث عن منتج أو مبنى")}`;
  for (const r of rows) out += `<div class="item">${F("opt_item_save", `${hid("id", r.id)}<div class="row"><img class="th" style="width:52px;height:52px" src="https://hd-market-web-production.up.railway.app/img/food/f${String(num(r.id)).padStart(3, "0")}.webp" alt="" loading="lazy"><div class="grow"><b>${h(r.name)}</b><br><span class="sm">${h(r.building)} · ${h(t("مستوى"))} ${num(r.level)}</span></div><input type="number" step="any" min="0" name="price" value="${r.price == null ? "" : num(r.price)}" placeholder="${dp}" style="width:130px">${sw("active", t("ظاهر"), !!num(r.active))}<button class="s">${h(t("حفظ"))}</button></div>`, `&q=${encodeURIComponent(q)}&pg=${pg}`)}</div>`;
  return { title: t("منتجات اختياري – الأسعار"), body: out + pager(ctx, total, pg, per) };
}
async function randomPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  const form = (b: any) => F("box_save", `${b ? hid("id", b.id) : ""}<div class="fg">${field(t("اسم الصندوق"), `<input type="text" class="w" name="name" value="${h(b?.name ?? "")}" required>`)}${field(t("السعر (USDT)"), `<input type="number" class="w" step="any" min="0" name="price" value="${b ? num(b.price) : ""}" required>`)}</div>${field(t("الوصف"), `<input type="text" class="w" name="descr" value="${h(b?.descr ?? "")}">`)}<div class="row" style="margin-top:10px">${sw("active", t("ظاهر للمستخدمين"), !b || !!num(b.active))}${picker(b ? imgUrl("b", b) : null)}<button class="${b ? "" : "y"}">${h(t(b ? "حفظ" : "إضافة"))}</button></div>`);
  let out = `<p class="hint">${h(t("صندوق عشوائي: يدفع المستخدم سعره فيحصل على إحدى الجوائز عشوائيًا حسب «الوزن». الوزن الأكبر = فرصة أكبر. المخزون -1 = غير محدود."))}</p><div class="box"><h2>${h(t("إضافة صندوق"))}</h2>${form(null)}</div>`;
  for (const b of await run(`SELECT id, name, descr, price, active, ${IMG()} FROM random_boxes ORDER BY id DESC`)) {
    const prizes = await run(`SELECT * FROM random_prizes WHERE box_id = $1 ORDER BY id`, [b.id]);
    const tw = prizes.reduce((a, p) => a + (num(p.stock) !== 0 ? num(p.weight) : 0), 0) || 1;
    out += `<div class="item">${form(b)}<hr class="sep"><h3>${h(t("الجوائز"))}</h3>${prizes.map((p) => `<div style="margin-bottom:8px">${F("prize_save", `${hid("id", p.id)}<div class="row"><input type="text" class="grow" name="label" value="${h(p.label)}"><input type="number" min="1" name="weight" value="${num(p.weight)}" style="width:80px" title="${h(t("الوزن"))}"><input type="number" min="-1" name="stock" value="${num(p.stock)}" style="width:90px" title="${h(t("المخزون"))}"><span class="sm">${Math.round((num(p.stock) !== 0 ? num(p.weight) / tw : 0) * 100)}%</span><button class="s">${h(t("حفظ"))}</button></div>`)}${F("prize_del", `${hid("id", p.id)}<button class="r s" style="margin-top:4px">${h(t("حذف الجائزة"))}</button>`)}</div>`).join("")}
      ${F("prize_save", `${hid("box_id", b.id)}<div class="row"><input type="text" class="grow" name="label" placeholder="${h(t("جائزة جديدة"))}" required><input type="number" min="1" name="weight" value="1" style="width:80px"><input type="number" min="-1" name="stock" value="-1" style="width:90px"><button class="y s">${h(t("إضافة"))}</button></div>`)}
      <div class="acts">${F("box_del", `${hid("id", b.id)}<button class="r s" onclick="return confirm('${h(t("حذف الصندوق؟"))}')">${h(t("حذف الصندوق"))}</button>`)}</div></div>`;
  }
  const params: any[] = ["random"]; const { w, st } = stWhere(ctx, "o.kind = $1", params);
  out += `<h2>${h(t("طلبات الصناديق العشوائية"))}</h2>${chips(ctx, "st", ST_FILTERS, st)}${await ordersList(ctx, w, params)}`;
  return { title: t("المنتجات العشوائية"), body: out, js: PICK_JS };
}
async function codesPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  const form = (p: any) => F("code_plan_save", `${p ? hid("id", p.id) : ""}<div class="fg">${field(t("اسم الباقة"), `<input type="text" class="w" name="name" value="${h(p?.name ?? "")}" required>`)}${field(t("السعر (USDT)"), `<input type="number" class="w" step="any" min="0" name="price" value="${p ? num(p.price) : ""}" required>`)}</div>${field(t("الوصف"), `<input type="text" class="w" name="descr" value="${h(p?.descr ?? "")}">`)}<div class="row" style="margin-top:10px">${sw("active", t("ظاهرة للمستخدمين"), !p || !!num(p.active))}${picker(p ? imgUrl("p", p) : null)}<button class="${p ? "" : "y"}">${h(t(p ? "حفظ" : "إضافة"))}</button></div>`);
  let out = `<p class="hint">${h(t("كل باقة لها مخزون أكواد. عند الشراء يُسحب كود متاح تلقائيًا ويُسلَّم للمشتري فورًا."))}</p><div class="box"><h2>${h(t("إضافة باقة اشتراك"))}</h2>${form(null)}</div>`;
  for (const p of await run(`SELECT id, name, descr, price, active, ${IMG()}, (SELECT COUNT(*) FROM sub_codes s WHERE s.product_id = products.id AND s.status = 'available') av, (SELECT COUNT(*) FROM sub_codes s WHERE s.product_id = products.id AND s.status = 'sold') sd FROM products WHERE kind = 'code' ORDER BY id DESC`)) {
    const avail = await run(`SELECT id, code FROM sub_codes WHERE product_id = $1 AND status = 'available' ORDER BY id LIMIT 30`, [p.id]);
    out += `<div class="item"><div class="row" style="margin-bottom:8px">${statusChip(num(p.av) ? "ok" : "bad", `${t("متاح")}: ${num(p.av)}`)}${statusChip("done", `${t("مباع")}: ${num(p.sd)}`)}</div>${form(p)}<hr class="sep">
      ${F("code_add", `${hid("id", p.id)}<label class="f">${h(t("إضافة أكواد (كود في كل سطر)"))}</label><textarea name="codes" class="mono" placeholder="XXXX-XXXX-XXXX"></textarea><div class="acts"><button class="y">${h(t("إضافة الأكواد"))}</button></div>`)}
      ${avail.length ? `<details><summary>${h(t("الأكواد المتاحة"))} (${num(p.av)})</summary>${avail.map((c) => `<div class="row" style="margin-top:6px"><span class="mono grow">${h(c.code)}</span>${F("code_del", `${hid("id", c.id)}<button class="r s">${h(t("حذف"))}</button>`)}</div>`).join("")}${num(p.av) > 30 ? `<div class="sm">…</div>` : ""}</details>` : ""}
      <div class="acts">${F("code_plan_del", `${hid("id", p.id)}<button class="r s" onclick="return confirm('${h(t("حذف الباقة؟"))}')">${h(t("حذف الباقة"))}</button>`)}</div></div>`;
  }
  const params: any[] = ["code"]; const { w, st } = stWhere(ctx, "o.kind = $1", params);
  const stc = ctx.url.searchParams.get("st") ? st : "all";
  const w2 = stc === "all" ? "o.kind = $1" : w;
  out += `<h2>${h(t("طلبات الأكواد"))}</h2>${chips(ctx, "st", [["all", "الكل"], ["done", "مكتمل"], ["cancelled", "ملغي"]], stc)}${await ordersList(ctx, w2, stc === "all" ? ["code"] : params)}`;
  return { title: t("أكواد الاشتراك وطلباتها"), body: out, js: PICK_JS };
}

// ---------- customers & communication ----------
async function usersPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx; const pg = pageNo(ctx), q = (ctx.url.searchParams.get("q") ?? "").trim(), per = 20;
  const params: any[] = []; let where = "";
  if (q) { params.push(`%${q.toLowerCase()}%`); where = `WHERE username_lc LIKE $1 OR email LIKE $1`; }
  const total = await count(`SELECT COUNT(*) c FROM users ${where}`, params);
  const rows = await run(`SELECT id, username, email, avatar, status, failed, locked_until, last_login, created_at FROM users ${where} ORDER BY id DESC LIMIT ${per} OFFSET ${(pg - 1) * per}`, params);
  const wl: Record<string, Record<string, number>> = {};
  if (rows.length) for (const w of await run(`SELECT user_id, currency, amount FROM user_wallets WHERE user_id IN (${rows.map((r) => Number(r.id)).join(",")})`)) (wl[w.user_id] ??= {})[w.currency] = num(w.amount);
  const now = nowS();
  let out = searchBox(ctx, q, "بحث بالاسم أو البريد") + `<p class="hint">${h(t("إجمالي"))}: ${total}</p>`;
  const ex = `&q=${encodeURIComponent(q)}&pg=${pg}`;
  for (const r of rows) {
    const locked = num(r.locked_until) > now, banned = r.status === "banned";
    const av = r.avatar ? `<img src="${h(r.avatar)}" alt="">` : h([...String(r.username)][0]?.toUpperCase());
    const b = (act: string, label: string, cls = "g", cf = "") => F(act, `${hid("id", r.id)}<button class="${cls} s"${cf ? ` onclick="return confirm('${h(t(cf))}')"` : ""}>${h(t(label))}</button>`, ex);
    out += `<div class="item"><div class="hd"><span class="av">${av}</span><div><b>${h(r.username)}</b> ${banned ? statusChip("bad", t("محظور")) : locked ? statusChip("bad", t("مقفل مؤقتًا")) : statusChip("ok", t("نشط"))}<br><span class="sm mono">${h(r.email)}</span><br><span class="sm">ID ${num(r.id)} · ${h(t("تسجيل"))}: ${fmtT(r.created_at)} · ${h(t("آخر دخول"))}: ${fmtT(r.last_login)}</span></div></div>
      <div class="row" style="margin-top:8px">${CURRENCIES.map((c) => `<span class="chip" dir="ltr"><b>${money(wl[r.id]?.[c] ?? 0)}</b> ${c}</span>`).join("")}</div>
      <div class="acts">${banned ? b("unban", "رفع الحظر", "y") : b("ban", "حظر", "g", "حظر هذا المستخدم؟")}${locked || num(r.failed) > 0 ? b("unlock", "فتح القفل") : ""}${b("resetpw", "كلمة مرور مؤقتة", "g", "إنشاء كلمة مرور مؤقتة وتسجيل خروجه؟")}${r.avatar ? b("noavatar", "حذف الصورة") : ""}${b("delete", "حذف", "r", "حذف الحساب نهائيًا؟")}</div>
      <details><summary>${h(t("تعديل الرصيد"))}</summary>${F("bal_adjust", `${hid("id", r.id)}<div class="fg" style="margin-top:8px"><select name="currency" class="w">${CURRENCIES.map((c) => `<option>${c}</option>`).join("")}</select><input type="number" class="w" step="any" name="amount" placeholder="${h(t("المبلغ (موجب للإضافة، سالب للخصم)"))}" required><input type="text" class="w" name="reason" placeholder="${h(t("السبب (مطلوب)"))}" required></div><button class="y s" onclick="return confirm('${h(t("تأكيد تعديل الرصيد؟"))}')">${h(t("تنفيذ"))}</button>`, ex)}</details></div>`;
  }
  if (!rows.length) out += `<div class="box" style="text-align:center;color:#6b7488">${h(t("لا يوجد مستخدمون."))}</div>`;
  return { title: t("المستخدمون والأرصدة"), body: out + pager(ctx, total, pg, per) };
}
async function supportPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx; const uid = Number(ctx.url.searchParams.get("u")) || 0;
  const threads = await run(`SELECT m.user_id, u.username, MAX(m.id) last_id, SUM(CASE WHEN m.sender='user' AND m.seen=0 THEN 1 ELSE 0 END) unread FROM messages m LEFT JOIN users u ON u.id = m.user_id GROUP BY m.user_id, u.username ORDER BY last_id DESC LIMIT 100`);
  let out = `<div class="box"><div class="tabs" id="thr">${threads.map((x) => `<a class="${uid === Number(x.user_id) ? "on" : ""}" href="/admin?tab=support&u=${x.user_id}">${h(x.username ?? "—")}${num(x.unread) ? `<i>${num(x.unread)}</i>` : ""}</a>`).join("") || h(t("لا توجد رسائل بعد."))}</div>`;
  if (uid > 0) {
    await run(`UPDATE messages SET seen = 1 WHERE user_id = $1 AND sender = 'user'`, [uid]);
    const msgs = (await run(`SELECT * FROM messages WHERE user_id = $1 ORDER BY id DESC LIMIT 200`, [uid])).reverse();
    out += `<div class="chat" id="chat">${msgs.map((m) => `<div class="bub ${m.sender === "admin" ? "a" : "u"}">${h(m.body)}<br><small style="opacity:.6">${fmtT(m.created_at)}</small></div>`).join("")}</div>${F("support_reply", `${hid("uid", uid)}<textarea name="body" placeholder="${h(t("اكتب ردك"))}" required></textarea><div class="acts"><button class="y">${h(t("إرسال الرد"))}</button></div>`, `&u=${uid}`)}`;
  }
  return { title: t("دعم العملاء"), body: out + `</div>`, js: LIVE_JS };
}
async function groupsPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  const form = (g: any) => F("group_save", `${g ? hid("id", g.id) : ""}<div class="fg">${field(t("اسم المجموعة"), `<input type="text" class="w" name="name" value="${h(g?.name ?? "")}" required>`)}${field(t("رابط الانضمام (https://...)"), `<input type="text" class="w mono" name="url" value="${h(g?.url ?? "")}" required>`)}${field(t("الترتيب"), `<input type="number" class="w" name="sort" value="${g ? num(g.sort) : 0}">`)}</div>${field(t("الوصف"), `<input type="text" class="w" name="descr" value="${h(g?.descr ?? "")}">`)}<div class="row" style="margin-top:10px">${sw("active", t("ظاهرة"), !g || !!num(g.active))}${picker(g ? imgUrl("g", g) : null)}<button class="${g ? "" : "y"}">${h(t(g ? "حفظ" : "إضافة"))}</button></div>`);
  let out = `<p class="hint">${h(t("روابط مجموعات المجتمع (واتساب، تيليجرام، ديسكورد...) تظهر للمستخدمين في التطبيق."))}</p><div class="box"><h2>${h(t("إضافة مجموعة"))}</h2>${form(null)}</div>`;
  for (const g of await run(`SELECT id, name, url, descr, sort, active, ${IMG()} FROM hd_groups ORDER BY sort, id`)) out += `<div class="item">${form(g)}<div class="acts">${F("group_del", `${hid("id", g.id)}<button class="r s" onclick="return confirm('${h(t("حذف المجموعة؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`;
  return { title: t("المجموعات"), body: out, js: PICK_JS };
}
async function annPage(ctx: Ctx): Promise<Page> {
  const { t, F, hid } = ctx;
  let out = `<div class="box"><h2>${h(t("إعلان جديد"))}</h2>${F("ann_save", `${field(t("العنوان"), `<input type="text" class="w" name="title" required>`)}<div style="margin-top:10px">${field(t("النص"), `<textarea name="body" required></textarea>`)}</div><div class="row" style="margin-top:10px">${sw("pinned", t("تثبيت في الأعلى"), false)}${sw("push", t("إرسال إشعار لكل المستخدمين"), true)}${picker(null)}<button class="y">${h(t("نشر"))}</button></div>`)}</div>`;
  for (const a of await run(`SELECT id, title, body, pinned, active, created_at, ${IMG()} FROM announcements ORDER BY id DESC LIMIT 100`))
    out += `<div class="item"><span class="sm">${fmtT(a.created_at)}</span> ${num(a.pinned) ? statusChip("processing", t("مثبّت")) : ""} ${num(a.active) ? "" : statusChip("bad", t("مخفي"))}${F("ann_save", `${hid("id", a.id)}<div style="margin-top:6px"><input type="text" class="w" name="title" value="${h(a.title)}"></div><div style="margin-top:8px"><textarea name="body">${h(a.body)}</textarea></div><div class="row" style="margin-top:8px">${sw("pinned", t("مثبّت"), !!num(a.pinned))}${sw("active", t("ظاهر"), !!num(a.active))}${picker(imgUrl("n", a))}<button>${h(t("حفظ"))}</button></div>`)}<div class="acts">${F("ann_push", `${hid("id", a.id)}<button class="g s">${h(t("إرسال إشعار مرة أخرى"))}</button>`)}${F("ann_del", `${hid("id", a.id)}<button class="r s" onclick="return confirm('${h(t("حذف الإعلان؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`;
  return { title: t("الإعلانات"), body: out, js: PICK_JS };
}
async function settingsPage(ctx: Ctx): Promise<Page> {
  const { t, F } = ctx;
  const mo = (await getSet("maint_on")) === "1", bo = (await getSet("banner_on")) === "1";
  return { title: t("الإعدادات والصيانة"), body: `<div class="box"><h2>${h(t("وضع الصيانة والشريط الإعلاني"))}</h2>${F("set_save", `
    <p>${sw("maint_on", t("تفعيل وضع الصيانة (يُمنع المستخدمون من استخدام التطبيق ويرون الرسالة أدناه)"), mo)}</p>
    <p><textarea name="maint_msg" placeholder="${h(t("رسالة الصيانة"))}">${h(await getSet("maint_msg", "التطبيق تحت الصيانة حاليًا. نعود قريبًا."))}</textarea></p><hr class="sep">
    <p>${sw("banner_on", t("إظهار شريط إعلاني في أعلى التطبيق"), bo)}</p>
    <p><textarea name="banner_text" placeholder="${h(t("نص الإعلان"))}">${h(await getSet("banner_text"))}</textarea></p><hr class="sep">
    <p class="hint">${h(t("تحديث ملف التطبيق (APK) نادر جدًا الآن: كل تعديلات التصميم والمحتوى تظهر مباشرة. استخدم هذا فقط لو غُيّر الغلاف الأصلي للتطبيق."))}</p>
    <div class="fg"><input type="text" class="w mono" name="upd_version" placeholder="${h(t("رقم الإصدار الجديد"))}" value="${h(await getSet("upd_version"))}"><input type="text" class="w mono" name="upd_url" placeholder="${h(t("رابط ملف APK"))}" value="${h(await getSet("upd_url"))}"></div>
    <p><textarea name="upd_notes" placeholder="${h(t("ما الجديد في التحديث (اختياري)"))}">${h(await getSet("upd_notes"))}</textarea></p><p>${sw("upd_force", t("تحديث إجباري"), (await getSet("upd_force")) === "1")}</p>
    <button class="y">${h(t("حفظ"))}</button>`)}</div>` };
}

export async function renderPage(tab: string, ctx: Ctx): Promise<Page> {
  switch (tab) {
    case "farm_orders": return ordersPage(ctx, "farm", "طلبات المزارع");
    case "farm_delivery": return ordersPage(ctx, "farm", "تسليم المزارع", "اضغط «تسليم» لإرسال ID / Token للمشتري وإكمال الطلب. أدخل البيانات أولًا من «بيانات المزارع».");
    case "tool_orders": return ordersPage(ctx, "tool", "طلبات الأدوات والمنتجات");
    case "opt_orders": return ordersPage(ctx, "opt", "طلبات منتجات اختياري");
    case "codes": return codesPage(ctx);
    case "deposits": return depositsPage(ctx);
    case "deposit_history": return depositHistory(ctx);
    case "methods": return methodsPage(ctx);
    case "rates": return ratesPage(ctx);
    case "ledger": return ledgerPage(ctx);
    case "audit": return auditPage(ctx);
    case "categories": return categoriesPage(ctx);
    case "farms": return farmsPage(ctx);
    case "farm_data": return farmDataPage(ctx);
    case "opt_prices": return optPricesPage(ctx);
    case "random": return randomPage(ctx);
    case "users": return usersPage(ctx);
    case "support": return supportPage(ctx);
    case "groups": return groupsPage(ctx);
    case "announcements": return annPage(ctx);
    case "settings": return settingsPage(ctx);
    default: return dashboard(ctx);
  }
}
export async function navBadges(): Promise<Record<string, number>> {
  return {
    farm_delivery: await count(`SELECT COUNT(*) c FROM orders WHERE kind = 'farm' AND status IN ('new','processing')`),
    tool_orders: await count(`SELECT COUNT(*) c FROM orders WHERE kind = 'tool' AND status = 'new'`),
    opt_orders: await count(`SELECT COUNT(*) c FROM orders WHERE kind = 'opt' AND status = 'new'`),
    deposits: await count(`SELECT COUNT(*) c FROM deposit_orders WHERE status IN ('proof_sent','amount_mismatch')`),
    support: await count(`SELECT COUNT(*) c FROM messages WHERE sender = 'user' AND seen = 0`),
  };
}
