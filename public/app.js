"use strict";
/* HD Market web app — everything is served live; no APK update is ever needed. */
const API_BASE = /^(localhost|127\.)/.test(location.hostname) ? "http://localhost:3111" : "https://hd-market-api-production.up.railway.app";
const DEC = { JOD: 3, IQD: 0, USDT: 4 };
const CURS = ["JOD", "IQD", "USDT"];
const TONES = ["soft_bell", "bell", "marimba", "harp", "bubble", "digital", "loud", "calm", "ding", "silent"];
const LS = {
  get(k, d) { try { const v = localStorage.getItem("hd_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hd_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("hd_" + k); } catch {} },
};
const S = {
  token: LS.get("token", ""), user: LS.get("user", null), lang: LS.get("lang", "ar"), theme: LS.get("theme", "light"),
  cur: LS.get("cur", "JOD"), tone: LS.get("tone", "soft_bell"), cart: LS.get("cart", {}), opt: LS.get("optcart", {}),
  notif: LS.get("notif", true), lastSup: LS.get("lastsup", 0), supUnread: 0, ntab: "alerts", cfg: null, home: null, catalog: null, optItems: null, unread: 0, lastNotif: LS.get("lastnotif", 0),
};
const APP_VER = "4.0.0";
const LANGS = { ar: "العربية", en: "English", vi: "Tiếng Việt", zh: "中文" };
const LOC = { ar: "ar-JO-u-nu-latn", en: "en-GB", vi: "vi-VN", zh: "zh-CN" };
const ar = () => S.lang === "ar";
const T = (a, e) => (S.lang === "ar" ? a : S.lang === "vi" ? VI[e] || e : S.lang === "zh" ? ZH[e] || e : e);
const cmpVer = (a, b) => { const x = String(a || "0").split(".").map(Number), y = String(b || "0").split(".").map(Number); for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shell = (m) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch {} };

/* ---------- icons ---------- */
const P = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", wallet: "M3 7a2 2 0 0 1 2-2h13v3H5v0h16v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 14h3",
  bag: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2", chat: "M4 5h16v11H9l-5 4z", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0", globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  back: "M15 5l-7 7 7 7", plus: "M12 5v14M5 12h14", farm: "M3 20V10l9-6 9 6v10zM9 20v-6h6v6", key: "M14 10a4 4 0 1 0-3.9 4L10 20h3v-2h2v-2h2l1-2.2",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0", cart: "M3 4h3l2 12h11l2-8H7M10 20h.01M17 20h.01", link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  news: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5", copy: "M8 8h11v12H8zM5 16V4h11",
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;

/* ---------- money ---------- */
const rate = (c) => (c === "USDT" ? 1 : (S.cfg?.rates || S.home?.rates || {})[c] || 1);
const conv = (usdt, c) => { const f = 10 ** DEC[c]; return Math.ceil(usdt * rate(c) * f - 1e-7) / f; };
const num = (v, c) => Number(v).toLocaleString("en-US", { minimumFractionDigits: c === "IQD" ? 0 : Math.min(2, DEC[c] || 2), maximumFractionDigits: DEC[c] ?? 4 });
const money = (usdt, c = S.cur) => `${num(conv(usdt, c), c)} ${c}`;
const unit = (usdt, c = S.cur) => { const v = usdt * rate(c); return `${Number(v.toFixed(c === "IQD" ? 2 : 6))} ${c}`; };
const amt = (v, c) => `${num(v, c)} ${c}`;
const bal = (c) => Number(S.user?.balances?.[c] || 0);

/* ---------- time ---------- */
const fmtD = (ts) => new Date(ts * 1000).toLocaleString(LOC[S.lang], { timeZone: "Asia/Amman", dateStyle: "medium", timeStyle: "short" });
function tick() {
  const d = new Date(), el = $("#clk");
  if (!el) return;
  const o = { timeZone: "Asia/Amman" }, loc = LOC[S.lang];
  el.innerHTML = `<b>${d.toLocaleTimeString(loc, { ...o, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</b>${d.toLocaleDateString(loc, { ...o, weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
}
setInterval(tick, 1000);

/* ---------- errors / api ---------- */
const ERR = {
  invalid: ["بيانات غير صالحة", "Invalid data"], invalid_username: ["اسم المستخدم غير صالح (2–30 حرفًا)", "Invalid username (2–30 chars)"], invalid_email: ["البريد الإلكتروني غير صالح", "Invalid email"],
  short_password: ["كلمة المرور قصيرة (8 أحرف على الأقل)", "Password too short (min 8)"], email_taken: ["البريد مستخدم مسبقًا", "Email already used"], username_taken: ["اسم المستخدم مستخدم", "Username taken"],
  no_account: ["الحساب غير موجود", "Account not found"], banned: ["الحساب موقوف", "Account suspended"], locked: ["الحساب مقفل مؤقتًا، حاول لاحقًا", "Account temporarily locked"],
  wrong_password: ["كلمة المرور غير صحيحة", "Wrong password"], invalid_code: ["الرمز غير صحيح أو منتهٍ", "Invalid or expired code"], too_many: ["محاولات كثيرة، انتظر قليلًا", "Too many attempts"],
  mail_failed: ["تعذّر إرسال البريد", "Could not send email"], unauthorized: ["انتهت الجلسة، سجّل الدخول", "Session expired"], insufficient_balance: ["رصيدك غير كافٍ", "Insufficient balance"],
  out_of_stock: ["نفدت الكمية", "Out of stock"], limit_exceeded: ["تجاوزت الحد الأقصى للطلب", "Order limit exceeded"], not_found: ["غير موجود", "Not found"],
  out_of_limits: ["المبلغ خارج الحدود المسموحة", "Amount outside allowed limits"], too_soon: ["لا يمكن تغيير الاسم الآن", "You can't change the name yet"], invalid_avatar: ["الصورة غير صالحة أو كبيرة", "Invalid or too large image"],
  bad_transition: ["لا يمكن تنفيذ العملية في هذه الحالة", "Not possible in this state"], network: ["تعذّر الاتصال بالخادم", "Cannot reach the server"], server: ["خطأ في الخادم", "Server error"],
};
const errMsg = (e) => { const m = ERR[e?.error]; return m ? T(...m) : T("حدث خطأ", "Something went wrong") + (e?.error ? ` (${e.error})` : ""); };
async function api(name, body = {}, auth = true) {
  let r, j;
  try {
    r = await fetch(`${API_BASE}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auth ? { token: S.token, ...body } : body) });
    j = await r.json();
  } catch { throw { error: "network" }; }
  if (r.status === 503 && j.error === "maintenance") { maint(j.message); throw j; }
  if (r.status === 401 && auth) { logout(true); throw j; }
  if (!r.ok) throw j;
  return j;
}
const idem = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ---------- ui helpers ---------- */
let toastT;
function toast(msg, kind = "") {
  $(".toast")?.remove();
  const d = document.createElement("div"); d.className = "toast " + kind; d.textContent = msg; document.body.appendChild(d);
  clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 3200);
}
function sheet(html) {
  closeSheet();
  const o = document.createElement("div"); o.className = "ov"; o.id = "sheet";
  o.innerHTML = `<div class="sheet">${html}</div>`;
  o.addEventListener("click", (e) => { if (e.target === o) closeSheet(); });
  document.body.appendChild(o);
  return o;
}
const closeSheet = () => $("#sheet")?.remove();
const view = (h) => { $("#view").innerHTML = h; window.scrollTo(0, 0); };
const loading = () => view(`<div class="full"><div class="spin"></div></div>`);
const go = (h) => { if (location.hash === "#" + h) route(); else location.hash = h; };
const needLogin = () => { if (S.token) return false; toast(T("سجّل الدخول أولًا", "Please sign in first"), "e"); go("/login"); return true; };
async function copy(txt) { try { await navigator.clipboard.writeText(txt); toast(T("تم النسخ", "Copied"), "s"); } catch { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); toast(T("تم النسخ", "Copied"), "s"); } catch {} t.remove(); } }
const playTone = (t) => { if (!t || t === "silent") return; try { const a = new Audio(`/sounds/hd_${t}.wav`); a.play().catch(() => {}); } catch {} };
const img = (src, cls = "th") => src ? `<img class="${cls}" loading="lazy" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">` : `<div class="${cls}"></div>`;
const STAT = {
  awaiting_payment: ["بانتظار الدفع", "Awaiting payment", "o"], proof_sent: ["تم إرسال الإثبات", "Proof sent", "o"], under_review: ["قيد المراجعة", "Under review", "o"], verifying: ["قيد التحقق", "Verifying", "o"],
  approved: ["تمت الموافقة", "Approved", "g"], credited: ["تمت إضافة الرصيد", "Credited", "g"], rejected: ["مرفوض", "Rejected", "r"], cancelled: ["ملغي", "Cancelled", "r"], expired: ["منتهي", "Expired", "n"],
  amount_mismatch: ["مبلغ غير مطابق", "Amount mismatch", "r"], reversed: ["تم العكس", "Reversed", "r"], done: ["مكتمل", "Done", "g"], new: ["جديد", "New", "o"], processing: ["قيد التنفيذ", "Processing", "o"],
};
const stBadge = (s) => { const x = STAT[s] || [s, s, "n"]; return `<span class="st ${x[2]}">${esc(T(x[0], x[1]))}</span>`; };

/* ---------- shell / frame ---------- */
function applyPrefs() {
  document.documentElement.lang = S.lang; document.documentElement.dir = ar() ? "rtl" : "ltr";
  document.documentElement.dataset.theme = S.theme;
}
function frame() {
  const h = location.hash.slice(1) || "/";
  const auth = /^\/(login|register|forgot)/.test(h);
  const walletPage = /^\/(wallet|topup|history|tx)/.test(h);
  const app = $("#app");
  if (auth) { app.innerHTML = `<div id="view"></div>`; return; }
  const navOn = (p) => (p === "/" ? h === "/" : h.startsWith(p)) ? "on" : "";
  app.innerHTML = `<div class="hwrap"><div class="hdr">
    <a href="#/"><img class="logo" src="/img/logo-192.png" alt="HD"></a>
    <div class="clk" id="clk"></div>
    ${walletPage ? "" : `<button class="ib" data-a="lang" aria-label="language">${ic("globe")}</button>`}
    <button class="ib" data-a="acct" aria-label="account">${S.user?.avatar ? `<img src="${esc(S.user.avatar)}" alt="">` : ic("user")}</button>
    <div class="ibw"><button class="ib" data-a="bell" aria-label="alerts">${ic("bell")}</button><span class="badge" id="bdg" ${S.unread ? "" : "hidden"}>${S.unread > 99 ? "99+" : S.unread}</span></div>
  </div><div class="tick" id="tick" hidden></div></div>
  <div id="view"></div>
  <nav class="nav">
    <a href="#/" class="${navOn("/")}">${ic("home")}${T("الرئيسية", "Home")}</a>
    <a href="#/wallet" class="${navOn("/wallet") || navOn("/topup") || navOn("/history")}">${ic("wallet")}${T("المحفظة", "Wallet")}</a>
    <a href="#/orders" class="${navOn("/orders")}">${ic("bag")}${T("طلباتي", "Orders")}</a>
    <a href="#/support" class="${navOn("/support")}">${ic("chat")}${T("الدعم", "Support")}<span class="badge" id="supb" ${S.supUnread ? "" : "hidden"}>${S.supUnread}</span></a>
    <a href="#/account" class="${navOn("/account")}">${ic("user")}${T("حسابي", "Account")}</a>
  </nav>`;
  tick(); drawTicker();
}
function drawTicker() {
  const el = $("#tick"); if (!el) return; const b = S.cfg?.banner, txt = b && b.on ? String(b.text || "").trim() : "";
  if (!txt) { el.hidden = true; el.dataset.t = ""; return; }
  el.hidden = false; if (el.dataset.t === txt) return; el.dataset.t = txt;
  const d = Math.max(12, Math.round(txt.length * 0.35 + 8));
  el.innerHTML = `<span style="animation-duration:${d}s">${esc(txt)}</span>`;
}
setInterval(async () => { if (document.hidden) return; try { S.cfg = await api("config", {}, false); drawTicker(); } catch {} }, 20000);
function maint(msg) {
  $("#app").innerHTML = `<div class="full"><div><img src="/img/logo-192.png" width="90" style="border-radius:22px"><h2 style="margin:14px 0 6px">${T("صيانة", "Maintenance")}</h2><p class="mut">${esc(msg || "")}</p><button class="btn sm" style="margin-top:16px" onclick="location.reload()">${T("إعادة المحاولة", "Retry")}</button></div></div>`;
}

/* ---------- session ---------- */
function setSession(token, user) {
  S.token = token || S.token; if (user) S.user = user;
  LS.set("token", S.token); LS.set("user", S.user);
  if (S.notif) shell({ type: "login", token: S.token, tone: S.tone });
}
function logout(expired) {
  if (S.token && !expired) api("logout", { token: S.token }, false).catch(() => {});
  S.token = ""; S.user = null; LS.del("token"); LS.del("user"); S.unread = 0;
  shell({ type: "logout" });
  if (expired) toast(T("انتهت الجلسة، سجّل الدخول", "Session expired"), "e");
  go("/login");
}
async function refreshMe() {
  if (!S.token) return;
  try { const u = await api("me"); S.user = { ...S.user, ...u }; delete S.user.ok; LS.set("user", S.user); } catch {}
}
async function loadCfg() { try { S.cfg = await api("config", {}, false); } catch (e) { if (e.error !== "maintenance") throw e; } }

/* ---------- router ---------- */
const R = [];
const on = (re, fn) => R.push([re, fn]);
let seq = 0;
async function route() {
  const h = location.hash.slice(1) || "/"; const my = ++seq;
  stopPolls(); closeSheet();
  frame();
  const protectedRe = /^\/(wallet|topup|history|tx|orders|support|account|notifs|cart|checkout)/;
  if (protectedRe.test(h) && !S.token) { go("/login"); return; }
  for (const [re, fn] of R) {
    const m = h.match(re);
    if (m) { loading(); try { await fn(...m.slice(1)); } catch (e) { if (my === seq && e?.error !== "maintenance" && e?.error !== "unauthorized") view(`<div class="page"><div class="err">${esc(errMsg(e))}</div><button class="btn ln" onclick="route()">${T("إعادة المحاولة", "Retry")}</button></div>`); } return; }
  }
  go("/");
}
let polls = [];
const poll = (fn, ms) => { fn(); polls.push(setInterval(fn, ms)); };
const stopPolls = () => { polls.forEach(clearInterval); polls = []; };
const back = (to) => `<button class="back" onclick="${to ? `go('${to}')` : "history.back()"}">${ic("back")}${T("رجوع", "Back")}</button>`;

/* ---------- auth pages ---------- */
const authShell = (title, sub, body) => `<div class="auth"><img class="big" src="/img/logo-192.png" alt="HD"><h1>${title}</h1><p class="mut">${sub || ""}</p><div class="card">${body}</div>
  <div style="margin-top:14px"><button class="lnk" data-a="lang">${ar() ? "English" : "العربية"}</button></div></div>`;
const fld = (id, label, type = "text", extra = "") => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra}></div>`;
on(/^\/login$/, async () => {
  view(authShell("HD Market", T("سجّل الدخول للمتابعة", "Sign in to continue"), `<div id="e"></div>
    ${fld("u", T("اسم المستخدم أو البريد", "Username or email"), "text", 'autocomplete="username" autocapitalize="none"')}${fld("p", T("كلمة المرور", "Password"), "password", 'autocomplete="current-password"')}
    <button class="btn" id="go">${T("دخول", "Sign in")}</button>
    <div class="row" style="justify-content:space-between;margin-top:8px"><a class="lnk" href="#/register">${T("حساب جديد", "Create account")}</a><a class="lnk" href="#/forgot">${T("نسيت كلمة المرور؟", "Forgot password?")}</a></div>`));
  const submit = async () => {
    const b = $("#go"); b.disabled = true; $("#e").innerHTML = "";
    try { const r = await api("login", { username: $("#u").value, password: $("#p").value }, false); const { token, ok, ...user } = r; setSession(token, user); go("/"); }
    catch (e) { $("#e").innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; b.disabled = false; }
  };
  $("#go").onclick = submit; $("#p").onkeydown = (e) => e.key === "Enter" && submit();
});
on(/^\/register$/, async () => {
  view(authShell(T("حساب جديد", "Create account"), "", `<div id="e"></div>
    ${fld("u", T("اسم المستخدم", "Username"), "text", 'autocomplete="username" autocapitalize="none"')}${fld("m", T("البريد الإلكتروني", "Email"), "email", 'autocomplete="email"')}${fld("p", T("كلمة المرور (8+ أحرف)", "Password (8+ chars)"), "password", 'autocomplete="new-password"')}
    <button class="btn" id="go">${T("إنشاء الحساب", "Sign up")}</button><div style="margin-top:8px"><a class="lnk" href="#/login">${T("لدي حساب", "I have an account")}</a></div>`));
  $("#go").onclick = async () => {
    const b = $("#go"); b.disabled = true; $("#e").innerHTML = "";
    try {
      await api("register", { username: $("#u").value, email: $("#m").value, password: $("#p").value }, false);
      const r = await api("login", { username: $("#u").value, password: $("#p").value }, false); const { token, ok, ...user } = r; setSession(token, user); go("/");
    } catch (e) { $("#e").innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; b.disabled = false; }
  };
});
on(/^\/forgot$/, async () => {
  let step = 1, email = "", rt = "";
  const draw = () => {
    const body = step === 1 ? `${fld("m", T("البريد الإلكتروني", "Email"), "email")}<button class="btn" id="go">${T("إرسال الرمز", "Send code")}</button>`
      : step === 2 ? `<p class="mut" style="margin-bottom:10px">${T("أدخل الرمز المرسل إلى", "Enter the code sent to")} ${esc(email)}</p>${fld("c", T("الرمز", "Code"), "text", 'inputmode="numeric" maxlength="4"')}<button class="btn" id="go">${T("تحقق", "Verify")}</button>`
        : `${fld("p", T("كلمة المرور الجديدة", "New password"), "password")}<button class="btn" id="go">${T("حفظ", "Save")}</button>`;
    view(authShell(T("استعادة كلمة المرور", "Reset password"), `${step}/3`, `<div id="e"></div>${body}<div style="margin-top:8px"><a class="lnk" href="#/login">${T("رجوع", "Back")}</a></div>`));
    $("#go").onclick = async () => {
      const b = $("#go"); b.disabled = true; $("#e").innerHTML = "";
      try {
        if (step === 1) { email = $("#m").value.trim(); const r = await api("forgot", { email, lang: S.lang }, false); step = 2; if (r.debug_code) toast("code: " + r.debug_code); }
        else if (step === 2) { rt = (await api("verify", { email, code: $("#c").value }, false)).reset_token; step = 3; }
        else { await api("reset", { email, reset_token: rt, password: $("#p").value }, false); toast(T("تم تغيير كلمة المرور", "Password changed"), "s"); go("/login"); return; }
        draw();
      } catch (e) { $("#e").innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; b.disabled = false; }
    };
  };
  draw();
});

/* ---------- home ---------- */
const TILE_IMG = { opt: "/img/cat/food.jpg", farms: "/img/cat/farms.jpg", codes: "/img/cat/products.jpg", boxes: "/img/cat/tools.jpg" };
on(/^\/$/, async () => {
  const [, h] = await Promise.all([loadCfg(), api("home", {}, false)]);
  S.home = h; S.catalog = null;
  if (S.token) refreshMe();
  const t = (to, title, sub, im, icn) => `<a class="tile ${im ? "" : "noimg"}" href="#${to}">${im ? img(im, "") : ""}<span class="ico">${ic(icn)}</span><span>${esc(title)}<small>${esc(sub)}</small></span></a>`;
  const c = h.counts, cats = h.categories || [];
  view(`<div class="page">
    <div class="seg" style="margin-bottom:12px">${CURS.map((x) => `<button class="${x === S.cur ? "on" : ""}" data-a="cur" data-v="${x}">${x}</button>`).join("")}</div>
    <div class="tiles">
      ${t("/opt", T("منتجات اختياري", "Optional products"), `${c.opt} ${T("منتج", "items")}`, TILE_IMG.opt, "bag")}
      ${t("/farms", T("المزارع", "Farms"), `${c.farms} ${T("متاحة", "available")}`, TILE_IMG.farms, "farm")}
      ${t("/codes", T("أكواد الاشتراك", "Subscription codes"), `${c.codes} ${T("نوع", "types")}`, TILE_IMG.codes, "key")}
      ${t("/boxes", T("المنتجات العشوائية", "Random boxes"), `${c.boxes} ${T("صندوق", "boxes")}`, TILE_IMG.boxes, "gift")}
      ${cats.map((x) => t("/cat/" + x.id, x.name, `${x.count} ${T("منتج", "items")}`, x.image, "bag")).join("")}
    </div>
    ${h.announcements?.length ? `<div class="h2">${T("الإعلانات", "Announcements")}<a href="#/news">${T("الكل", "All")}</a></div><div class="stack">${h.announcements.slice(0, 3).map(annCard).join("")}</div>` : ""}
    ${h.groups?.length ? `<div class="h2">${T("المجموعات", "Groups")}</div><div class="stack">${h.groups.map((g) => `<a class="item" href="${esc(g.url)}" target="_blank" rel="noopener">${img(g.image)}<div class="sp"><div class="t">${esc(g.name)}</div><div class="mut">${esc(g.descr)}</div></div>${ic("link")}</a>`).join("")}</div>` : ""}
  </div>`);
});
const annCard = (a) => `<div class="card">${a.image ? `<img src="${esc(a.image)}" style="width:100%;border-radius:14px;margin-bottom:8px" loading="lazy" alt="">` : ""}<div class="t" style="font-weight:900">${a.pinned ? "📌 " : ""}${esc(a.title)}</div><div style="white-space:pre-wrap;margin-top:4px">${esc(a.body)}</div><div class="mut" style="margin-top:6px">${fmtD(a.created_at)}</div></div>`;
on(/^\/news$/, async () => { const r = await api("announcements", {}, false); view(`<div class="page">${back("/")}<div class="stack">${r.items.map(annCard).join("") || `<div class="empty">${T("لا إعلانات", "No announcements")}</div>`}</div></div>`); });

/* ---------- optional products ---------- */
const bagCount = (m) => Object.values(m).reduce((a, b) => a + b, 0);
let optQ = "";
on(/^\/opt$/, async () => {
  if (!S.optItems) S.optItems = await api("opt_items", {}, false);
  const O = S.optItems; optQ = "";
  view(`<div class="page">${back("/")}
    <div class="search"><div class="row"><input class="in sp" id="q" type="search" placeholder="${T("ابحث عن منتج…", "Search products…")}"><button class="btn sm dk" data-a="paste">${T("لصق قائمة", "Paste list")}</button></div></div>
    <div class="mut" style="margin:4px 2px 8px">${T("السعر للقطعة", "Price per item")}: ${unit(O.price)}</div>
    <div class="stack" id="list"></div></div><div class="bar" id="obar"></div>`);
  const draw = () => {
    const q = optQ.trim().toLowerCase();
    const arr = O.items.filter((x) => !q || x.n.toLowerCase().includes(q) || x.b.toLowerCase().includes(q));
    $("#list").innerHTML = arr.slice(0, 120).map((x) => `<div class="item" data-id="${x.id}"><img class="th" loading="lazy" src="/img/food/f${String(x.id).padStart(3, "0")}.webp" alt="" onerror="this.style.visibility='hidden'">
      <div class="sp"><div class="t">${esc(x.n)}</div><div class="mut">${esc(x.b)} · Lv ${x.l}</div><div class="price">${unit(x.p)}</div></div>${stepper(x.id, S.opt[x.id] || 0)}</div>`).join("") + (arr.length > 120 ? `<div class="empty">${T("اكتب للبحث لإظهار المزيد", "Type to narrow results")} (${arr.length})</div>` : "") || `<div class="empty">${T("لا نتائج", "No results")}</div>`;
  };
  draw(); optBar();
  let tm; $("#q").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { optQ = e.target.value; draw(); }, 150); };
});
const stepper = (id, q) => `<div class="stp" data-sid="${id}"><button data-a="optdec" data-id="${id}">−</button><input inputmode="numeric" data-a="optset" data-id="${id}" value="${q}"><button data-a="optinc" data-id="${id}">+</button></div>`;
const optTotalUsdt = () => Object.entries(S.opt).reduce((a, [id, q]) => a + q * (S.optItems.items.find((x) => x.id == id)?.p ?? S.optItems.price), 0);
function optBar() {
  const n = bagCount(S.opt), b = $("#obar"); if (!b) return;
  b.hidden = !n;
  b.innerHTML = `<div class="in2"><div class="sp"><b>${n}</b> ${T("قطعة", "items")}<div class="price" style="font-size:13px">${money(optTotalUsdt())}</div></div><button class="btn sm ln" style="color:#fff;border-color:#fff4" data-a="optclear">${T("مسح", "Clear")}</button><button class="btn sm" data-a="optbuy">${T("تأكيد الطلب", "Review order")}</button></div>`;
}
function setOpt(id, q) {
  q = Math.max(0, Math.min(9999, Math.floor(q) || 0));
  if (q) S.opt[id] = q; else delete S.opt[id];
  LS.set("optcart", S.opt);
  const st = $(`.stp[data-sid="${id}"] input`); if (st) st.value = q;
  optBar();
}
function pasteList() {
  const o = sheet(`<h3>${T("لصق قائمة جاهزة", "Paste a ready list")}</h3><p class="mut" style="margin-bottom:8px">${T("سطر لكل منتج مثل: Lamb Doner Wrap x3", "One item per line, e.g. Lamb Doner Wrap x3")}</p><textarea class="in" id="pt" rows="9" style="direction:ltr"></textarea><div id="pr"></div><button class="btn" style="margin-top:10px" id="pg">${T("إضافة للسلة", "Add")}</button>`);
  $("#pg").onclick = () => {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ""), idx = S.optItems.items.map((x) => [norm(x.n), x]);
    const miss = []; let added = 0;
    for (let line of $("#pt").value.split(/\n+/)) {
      line = line.trim(); if (!line) continue;
      let q = 1, name = line, m;
      if ((m = line.match(/^(.*?)[\s]*[x×*:\-]\s*(\d+)\s*$/i)) || (m = line.match(/^(.*?)\s+(\d+)\s*$/))) { name = m[1]; q = +m[2]; }
      else if ((m = line.match(/^(\d+)\s*[x×*]?\s*(.+)$/i))) { q = +m[1]; name = m[2]; }
      const k = norm(name); if (!k) continue;
      const hit = idx.find(([n]) => n === k) || idx.find(([n]) => n.includes(k) || k.includes(n));
      if (hit) { setOpt(hit[1].id, (S.opt[hit[1].id] || 0) + q); added++; } else miss.push(line);
    }
    if (miss.length) { $("#pr").innerHTML = `<div class="err">${T("لم يتم التعرف على:", "Not recognised:")}<br>${miss.map(esc).join("<br>")}</div>`; }
    else closeSheet();
    if (added) { toast(`${T("أُضيف", "Added")} ${added}`, "s"); const l = $("#list"); if (l) l.querySelectorAll(".item").forEach((it) => { const i = it.dataset.id, inp = it.querySelector("input"); if (inp) inp.value = S.opt[i] || 0; }); }
  };
}

/* ---------- checkout sheet (all purchases) ---------- */
function buySheet({ title, usdt, lines, run, extra = "" }) {
  if (needLogin()) return;
  const draw = () => {
    const tot = conv(usdt, S.cur), have = bal(S.cur), low = have < tot;
    sheet(`<h3>${esc(title)}</h3>${lines ? `<div class="mut" style="margin-bottom:8px">${lines}</div>` : ""}${extra}
      <div class="seg" style="margin:8px 0">${CURS.map((x) => `<button class="${x === S.cur ? "on" : ""}" data-c="${x}">${x}</button>`).join("")}</div>
      <div class="row"><span class="sp">${T("الإجمالي", "Total")}</span><b class="price" style="font-size:20px">${amt(tot, S.cur)}</b></div>
      <div class="row mut"><span class="sp">${T("رصيدك", "Your balance")}</span><span>${amt(have, S.cur)}</span></div>
      <div id="se"></div>
      ${low ? `<div class="err">${T("رصيدك غير كافٍ", "Insufficient balance")}</div><a class="btn" href="#/topup" onclick="closeSheet()">${T("اشحن رصيدك", "Top up")}</a>` : `<button class="btn" id="cf">${T("تأكيد الشراء", "Confirm purchase")}</button>`}
      <button class="btn ln" style="margin-top:8px" onclick="closeSheet()">${T("إلغاء", "Cancel")}</button>`);
    $("#sheet").querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { S.cur = b.dataset.c; LS.set("cur", S.cur); draw(); }));
    const cf = $("#cf"); if (cf) { const key = idem(); cf.onclick = async () => { cf.disabled = true; try { const r = await run(S.cur, key); if (r.balances) { S.user.balances = r.balances; S.user.balance = r.balances.JOD; LS.set("user", S.user); } closeSheet(); } catch (e) { $("#se").innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; cf.disabled = false; } }; }
  };
  refreshMe().then(draw); draw();
}
const delivered = (o) => `<div class="page"><div class="card stack"><div style="text-align:center"><div style="font-size:42px">✅</div><h2>${T("تم الطلب بنجاح", "Order placed")}</h2><div class="mut">#${o.id} · ${amt(o.total, o.currency)}</div></div>
  ${o.delivery ? `<div class="code" id="dl">${esc(o.delivery)}</div><button class="btn dk" data-a="copy" data-v="${esc(o.delivery)}">${T("نسخ", "Copy")}</button>` : `<p class="mut" style="text-align:center">${o.kind === "farm" ? T("سيصلك ID/Token المزرعة من الإدارة قريبًا وستصلك رسالة تنبيه.", "The farm ID/Token will be sent by the admin soon; you'll get a notification.") : T("سيتم تنفيذ طلبك قريبًا.", "Your order will be processed soon.")}</p>`}
  <a class="btn ln" href="#/orders">${T("طلباتي", "My orders")}</a><a class="btn ln" href="#/">${T("الرئيسية", "Home")}</a></div></div>`;
const placed = (o) => { view(delivered(o)); };

/* ---------- categories / cart ---------- */
async function catalog() { if (!S.catalog) S.catalog = await api("catalog", {}, false); return S.catalog; }
const cartCount = () => bagCount(S.cart);
const cartUsdt = () => Object.entries(S.cart).reduce((a, [id, q]) => a + q * (S.catalog?.products.find((p) => p.id == id)?.price || 0), 0);
function cartBar() { const b = $("#cbar"); if (!b) return; const n = cartCount(); b.hidden = !n; b.innerHTML = `<div class="in2"><div class="sp"><b>${n}</b> ${T("قطعة", "items")}<div class="price" style="font-size:13px">${money(cartUsdt())}</div></div><a class="btn sm" href="#/cart">${T("السلة", "Cart")}</a></div>`; }
function setCart(id, q) {
  const p = S.catalog.products.find((x) => x.id == id); const mx = p?.max_order > 0 ? p.max_order : 9999;
  q = Math.max(0, Math.min(mx, p && p.qty >= 0 ? Math.min(mx, p.qty) : mx, Math.floor(q) || 0));
  if (q) S.cart[id] = q; else delete S.cart[id]; LS.set("cart", S.cart);
  const i = $(`.stp[data-sid="c${id}"] input`); if (i) i.value = q; cartBar();
}
const cstep = (id, q) => `<div class="stp" data-sid="c${id}"><button data-a="cdec" data-id="${id}">−</button><input inputmode="numeric" data-a="cset" data-id="${id}" value="${q}"><button data-a="cinc" data-id="${id}">+</button></div>`;
on(/^\/cat\/(\d+)$/, async (id) => {
  const c = await catalog(); const cat = c.categories.find((x) => x.id == id); const ps = c.products.filter((p) => p.category_id == id);
  view(`<div class="page">${back("/")}<div class="h2" style="margin-top:4px">${esc(cat?.name || "")}</div><div class="stack">${ps.map((p) => `<div class="item">${img(p.image)}<div class="sp"><div class="t">${esc(p.name)}${p.pack > 1 ? ` <span class="chip">×${p.pack}</span>` : ""}</div><div class="mut">${esc(p.descr)}</div><div class="price">${unit(p.price)}</div>${p.qty === 0 ? `<span class="st r">${T("نفد", "Sold out")}</span>` : ""}</div>${p.qty === 0 ? "" : cstep(p.id, S.cart[p.id] || 0)}</div>`).join("") || `<div class="empty">${T("لا منتجات", "No products")}</div>`}</div></div><div class="bar" id="cbar"></div>`);
  cartBar();
});
on(/^\/cart$/, async () => {
  const c = await catalog(); const ids = Object.keys(S.cart).filter((i) => c.products.find((p) => p.id == i));
  view(`<div class="page">${back()}<div class="h2" style="margin-top:4px">${T("السلة", "Cart")}</div>${ids.length ? `<div class="stack">${ids.map((i) => { const p = c.products.find((x) => x.id == i); return `<div class="item">${img(p.image)}<div class="sp"><div class="t">${esc(p.name)}</div><div class="price">${unit(p.price)}</div></div>${cstep(p.id, S.cart[i])}</div>`; }).join("")}</div>
    <div class="card" style="margin-top:12px"><div class="row"><span class="sp">${T("الإجمالي", "Total")}</span><b class="price" id="ctot">${money(cartUsdt())}</b></div><button class="btn" style="margin-top:10px" data-a="cartbuy">${T("متابعة الدفع", "Checkout")}</button></div>` : `<div class="empty">${T("السلة فارغة", "Your cart is empty")}</div>`}</div>`);
});

/* ---------- farms / codes / boxes ---------- */
on(/^\/farms$/, async () => {
  const r = await api("farms", {}, false); S.farms = r.farms;
  view(`<div class="page">${back("/")}<div class="h2" style="margin-top:4px">${T("المزارع", "Farms")}</div><div class="stack">${r.farms.map((f) => `<a class="item" href="#/farm/${f.id}">${img(f.image)}<div class="sp"><div class="t">${esc(f.name)}</div><div class="mut">Lv ${f.level}</div></div><div class="price">${money(f.price)}</div></a>`).join("") || `<div class="empty">${T("لا مزارع متاحة حاليًا", "No farms available now")}</div>`}</div></div>`);
});
on(/^\/farm\/(\d+)$/, async (id) => {
  const r = await api("farms", {}, false); const f = r.farms.find((x) => x.id == id);
  if (!f) { view(`<div class="page">${back("/farms")}<div class="empty">${T("المزرعة غير متاحة", "Farm unavailable")}</div></div>`); return; }
  view(`<div class="page">${back("/farms")}<div class="card stack">${f.image ? `<img src="${esc(f.image)}" style="width:100%;border-radius:14px" alt="">` : ""}<h2>${esc(f.name)}</h2><div class="chip">Level ${f.level}</div><div style="white-space:pre-wrap">${esc(f.descr)}</div><div class="price" style="font-size:22px">${money(f.price)}</div>
    <button class="btn" id="fb">${T("شراء المزرعة", "Buy farm")}</button><p class="mut">${T("يتم تسليم بيانات المزرعة (ID / Token) يدويًا من الإدارة بعد الشراء.", "Farm credentials (ID / Token) are delivered manually by the admin after purchase.")}</p></div></div>`);
  $("#fb").onclick = () => buySheet({ title: f.name, usdt: f.price, run: async (cur, key) => { const r = await api("farm_buy", { id: f.id, currency: cur, idem_key: key }); placed(r.order); return r; } });
});
on(/^\/codes$/, async () => {
  const r = await api("codes", {}, false);
  view(`<div class="page">${back("/")}<div class="h2" style="margin-top:4px">${T("أكواد الاشتراك", "Subscription codes")}</div><div class="stack">${r.codes.map((c) => `<div class="item">${img(c.image)}<div class="sp"><div class="t">${esc(c.name)}</div><div class="mut">${esc(c.descr)}</div><div class="price">${money(c.price)}</div>${c.stock > 0 ? `<span class="st g">${T("متوفر", "In stock")} ${c.stock}</span>` : `<span class="st r">${T("نفد", "Sold out")}</span>`}</div>${c.stock > 0 ? `<button class="btn sm" data-a="codebuy" data-id="${c.id}">${T("شراء", "Buy")}</button>` : ""}</div>`).join("") || `<div class="empty">${T("لا أكواد حاليًا", "No codes now")}</div>`}</div></div>`);
  S.codes = r.codes;
});
on(/^\/boxes$/, async () => {
  const r = await api("boxes", {}, false); S.boxes = r.boxes;
  view(`<div class="page">${back("/")}<div class="h2" style="margin-top:4px">${T("المنتجات العشوائية", "Random boxes")}</div><div class="stack">${r.boxes.map((b) => `<div class="card stack"><div class="row">${img(b.image)}<div class="sp"><div class="t" style="font-weight:900">${esc(b.name)}</div><div class="mut">${esc(b.descr)}</div></div><div class="price">${money(b.price)}</div></div><div>${b.prizes.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div><button class="btn" data-a="boxbuy" data-id="${b.id}">${T("افتح الصندوق", "Open box")}</button></div>`).join("") || `<div class="empty">${T("لا صناديق حاليًا", "No boxes now")}</div>`}</div></div>`);
});

/* ---------- orders ---------- */
const KIND = { tool: ["أدوات", "Tools"], opt: ["منتجات اختياري", "Optional"], farm: ["مزرعة", "Farm"], code: ["كود", "Code"], random: ["عشوائي", "Random"] };
function orderCard(o) {
  const lines = (o.lines || []).map((l) => `<div class="row"><span class="sp">${esc(l.n)} × ${l.q}</span>${l.prize ? `<b>🎁 ${esc(l.prize)}</b>` : ""}</div>`).join("");
  return `<div class="card stack"><div class="row"><div class="sp"><b>#${o.id}</b> <span class="chip">${esc(T(...(KIND[o.kind] || [o.kind, o.kind])))}</span></div>${stBadge(o.status)}</div>
    <div>${esc(o.name)}</div>${lines}<div class="row mut"><span class="sp">${fmtD(o.created_at)}</span><b class="price" style="color:var(--ink)">${amt(o.total, o.currency)}</b></div>
    ${o.delivery ? `<div class="code">${esc(o.delivery)}</div><button class="btn sm dk" data-a="copy" data-v="${esc(o.delivery)}">${ic("copy")} ${T("نسخ", "Copy")}</button>` : o.kind === "farm" && o.status !== "done" && o.status !== "cancelled" ? `<div class="mut">${T("بانتظار تسليم الإدارة", "Waiting for admin delivery")}</div>` : ""}</div>`;
}
on(/^\/orders$/, async () => {
  const draw = async () => { const r = await api("orders"); const v = $("#ol"); if (v) v.innerHTML = r.orders.map(orderCard).join("") || `<div class="empty">${T("لا طلبات بعد", "No orders yet")}</div>`; };
  view(`<div class="page"><div class="h2" style="margin-top:4px">${T("طلباتي", "My orders")}</div><div class="stack" id="ol"></div></div>`);
  poll(() => draw().catch(() => {}), 10000);
});

/* ---------- wallet ---------- */
const typeName = { deposit: ["شحن", "Top-up"], purchase: ["شراء", "Purchase"], refund: ["استرجاع", "Refund"], admin_credit: ["إضافة من الإدارة", "Admin credit"], admin_debit: ["خصم من الإدارة", "Admin debit"], reversal: ["عكس عملية", "Reversal"] };
const histRow = (x) => `<a class="item" href="#/tx/${esc(x.txn_id)}"><div class="sp"><div class="t">${esc(x.title || T(...(typeName[x.type] || [x.type, x.type])))}</div><div class="mut">${fmtD(x.created_at)} · ${esc(T(...(typeName[x.type] || [x.type, x.type])))}</div></div><div style="text-align:end"><div class="price" style="color:${x.amount < 0 ? "var(--err)" : "var(--ok)"};direction:ltr">${x.amount > 0 ? "+" : ""}${num(x.amount, x.currency)} ${x.currency}</div>${x.kind === "deposit" ? stBadge(x.status) : ""}</div></a>`;
on(/^\/wallet$/, async () => {
  const [w, h] = await Promise.all([api("wallet_overview"), api("wallet_history")]);
  S.user.balances = w.balances; LS.set("user", S.user);
  view(`<div class="page"><div class="bal">${CURS.map((c) => `<div><small>${c}</small><b>${num(w.balances[c] || 0, c)}</b></div>`).join("")}</div>
    <div class="row" style="margin:12px 0"><a class="btn sp" href="#/topup">${ic("plus")} ${T("شحن الرصيد", "Top up")}</a><a class="btn ln sp" href="#/history">${T("السجل", "History")}</a></div>
    <div class="h2">${T("آخر العمليات", "Recent activity")}</div><div class="stack">${h.items.slice(0, 8).map(histRow).join("") || `<div class="empty">${T("لا عمليات بعد", "No activity yet")}</div>`}</div></div>`);
});
on(/^\/history$/, async () => {
  const h = await api("wallet_history");
  view(`<div class="page">${back("/wallet")}<div class="h2" style="margin-top:4px">${T("سجل المحفظة", "Wallet history")}</div><div class="stack">${h.items.map(histRow).join("") || `<div class="empty">${T("لا عمليات", "No activity")}</div>`}</div></div>`);
});
on(/^\/topup$/, async () => {
  await loadCfg(); const ms = S.cfg?.methods || [];
  view(`<div class="page">${back("/wallet")}<div class="h2" style="margin-top:4px">${T("اختر طريقة الدفع", "Choose payment method")}</div><div class="stack">${ms.map((m) => `<a class="pm" href="#/topup/${m.id}">${img(m.icon, "")}<div class="sp"><div class="t" style="font-weight:900">${esc(m.name)}</div><div class="mut">${esc(m.currency)}${m.min_amount ? ` · ${T("الحد الأدنى", "min")} ${m.min_amount}` : ""}</div></div></a>`).join("") || `<div class="empty">${T("لا توجد طرق دفع متاحة حاليًا", "No payment methods available")}</div>`}</div></div>`);
});
on(/^\/topup\/(\d+)$/, async (id) => {
  await loadCfg(); const m = (S.cfg?.methods || []).find((x) => x.id == id);
  if (!m) { go("/topup"); return; }
  view(`<div class="page">${back("/topup")}<div class="card stack"><div class="row">${img(m.icon, "th")}<div class="sp"><div class="t" style="font-weight:900">${esc(m.name)}</div><div class="mut">${esc(m.currency)}</div></div></div>
    ${m.info ? `<div class="code">${esc(m.info)}</div><button class="btn sm dk" data-a="copy" data-v="${esc(m.info)}">${ic("copy")} ${T("نسخ", "Copy")}</button>` : ""}
    ${m.instructions ? `<div style="white-space:pre-wrap">${esc(m.instructions)}</div>` : ""}
    <div class="fld"><label>${T("المبلغ", "Amount")} (${esc(m.currency)}) ${m.min_amount ? `· ${T("من", "min")} ${m.min_amount}` : ""}${m.max_amount ? ` ${T("إلى", "max")} ${m.max_amount}` : ""}</label><input id="am" type="number" inputmode="decimal" step="any"></div><div id="e"></div>
    <button class="btn" id="go">${T("إنشاء طلب الشحن", "Create top-up request")}</button></div></div>`);
  const key = idem();
  $("#go").onclick = async () => {
    const b = $("#go"); b.disabled = true; $("#e").innerHTML = "";
    try { const r = await api("deposit_create", { method_id: m.id, amount: Number($("#am").value), idem_key: key }); go("/tx/" + r.order.txn_id); }
    catch (e) { $("#e").innerHTML = `<div class="err">${esc(errMsg(e))}${e.min ? ` (${e.min}–${e.max || "∞"})` : ""}</div>`; b.disabled = false; }
  };
});
const fileToData = (f, max = 440000) => new Promise((res, rej) => {
  const r = new FileReader(); r.onerror = rej;
  r.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => {
    let w = im.width, h = im.height, s = Math.min(1, 1280 / Math.max(w, h)), q = 0.85, out;
    for (let i = 0; i < 8; i++) { const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); out = c.toDataURL("image/jpeg", q); if (out.length <= max) break; q -= 0.1; s *= 0.85; }
    out.length <= max ? res(out) : rej(); }; im.src = r.result; };
  r.readAsDataURL(f);
});
on(/^\/tx\/([\w-]+)$/, async (id) => {
  const draw = async () => {
    const r = await api("transaction_get", { txn_id: id }); const v = $("#txv"); if (!v) return;
    if (r.kind === "deposit") {
      const o = r.order, left = o.expires_at - Math.floor(Date.now() / 1000);
      v.innerHTML = `<div class="card stack"><div class="row"><b class="sp">${esc(o.txn_id)}</b>${stBadge(o.status)}</div>
        <div class="row"><span class="sp mut">${T("الطريقة", "Method")}</span><b>${esc(o.method_name)}</b></div>
        <div class="row"><span class="sp mut">${T("المبلغ", "Amount")}</span><b>${amt(o.amount, o.currency)}</b></div>
        ${o.credit_amount != null ? `<div class="row"><span class="sp mut">${T("أُضيف للرصيد", "Credited")}</span><b>${amt(o.credit_amount, o.currency)}</b></div>` : ""}
        ${o.balance_after != null ? `<div class="row"><span class="sp mut">${T("الرصيد بعد", "Balance after")}</span><b>${amt(o.balance_after, o.currency)}</b></div>` : ""}
        <div class="row"><span class="sp mut">${T("التاريخ", "Date")}</span><span>${fmtD(o.created_at)}</span></div>
        ${o.reject_reason ? `<div class="err">${esc(o.reject_reason)}</div>` : ""}
        ${o.status === "awaiting_payment" ? `<div class="ban">${T("حوّل المبلغ ثم ارفع إثبات الدفع. ينتهي الطلب بعد", "Transfer the amount then upload the proof. Expires in")} ${Math.max(0, Math.ceil(left / 60))} ${T("دقيقة", "min")}</div>
          <input type="file" id="pf" accept="image/*" hidden><button class="btn" id="up">${T("رفع إثبات الدفع", "Upload payment proof")}</button><button class="btn ln" id="cx">${T("إلغاء الطلب", "Cancel request")}</button><div id="e"></div>` : ""}
        ${r.proof ? `<img src="${esc(r.proof)}" style="width:100%;border-radius:14px" alt="">` : ""}
        <div class="h2" style="margin:6px 0">${T("المسار", "Timeline")}</div><div class="tl">${r.history.map((h) => `<div><b>${esc(T(...(STAT[h.to_status] || [h.to_status, h.to_status])))}</b> <span class="mut">· ${fmtD(h.created_at)}</span>${h.note ? `<div class="mut">${esc(h.note)}</div>` : ""}</div>`).join("")}</div></div>`;
      const up = $("#up");
      if (up) {
        up.onclick = () => $("#pf").click();
        $("#pf").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; up.disabled = true; try { const data = await fileToData(f); await api("deposit_proof", { order_id: o.id, proof: data }); toast(T("تم رفع الإثبات", "Proof uploaded"), "s"); draw(); } catch (er) { $("#e").innerHTML = `<div class="err">${esc(er?.error ? errMsg(er) : T("تعذّرت معالجة الصورة", "Could not process image"))}</div>`; up.disabled = false; } };
        $("#cx").onclick = async () => { if (!confirm(T("إلغاء الطلب؟", "Cancel this request?"))) return; try { await api("deposit_cancel", { order_id: o.id }); draw(); } catch (er) { toast(errMsg(er), "e"); } };
      }
    } else {
      const t = r.txn;
      v.innerHTML = `<div class="card stack"><div class="row"><b class="sp">${esc(t.txn_id)}</b><span class="chip">${esc(T(...(typeName[t.type] || [t.type, t.type])))}</span></div>
        <div class="row"><span class="sp mut">${T("المبلغ", "Amount")}</span><b style="direction:ltr">${amt(t.amount, t.currency)}</b></div>
        <div class="row"><span class="sp mut">${T("الرصيد قبل", "Before")}</span><span>${amt(t.balance_before, t.currency)}</span></div>
        <div class="row"><span class="sp mut">${T("الرصيد بعد", "After")}</span><span>${amt(t.balance_after, t.currency)}</span></div>
        <div class="row"><span class="sp mut">${T("التاريخ", "Date")}</span><span>${fmtD(t.created_at)}</span></div>${t.note ? `<div>${esc(t.note)}</div>` : ""}</div>`;
    }
  };
  view(`<div class="page">${back("/history")}<div id="txv"></div></div>`);
  poll(() => { if (!document.activeElement || document.activeElement.tagName !== "INPUT") draw().catch(() => {}); }, 8000);
});

/* ---------- notifications ---------- */
on(/^\/notifs$/, async () => {
  const [r, an] = await Promise.all([api("notifications"), api("announcements", {}, false)]);
  const draw = () => {
    const alerts = r.items.map((n) => `<div class="card" data-a="notif" data-id="${n.id}" data-ref="${esc(n.ref || "")}" style="cursor:pointer;${n.is_read ? "opacity:.7" : "border-color:var(--gold)"}"><b>${esc(ar() ? n.title : n.title_en || n.title)}</b><div>${esc(ar() ? n.body : n.body_en || n.body)}</div><div class="mut" style="margin-top:4px">${fmtD(n.created_at)}</div></div>`).join("") || `<div class="empty">${T("لا تنبيهات", "No notifications")}</div>`;
    const ann = an.items.map(annCard).join("") || `<div class="empty">${T("لا إعلانات", "No announcements")}</div>`;
    view(`<div class="page"><div class="seg" style="margin:4px 0 10px"><button class="${S.ntab === "alerts" ? "on" : ""}" data-a="ntab" data-v="alerts">${T("التنبيهات", "Alerts")}</button><button class="${S.ntab === "ann" ? "on" : ""}" data-a="ntab" data-v="ann">${T("الإعلانات", "Announcements")}</button></div>
      ${S.ntab === "alerts" ? `<div class="row" style="justify-content:flex-end"><button class="lnk" data-a="readall">${T("تعليم الكل كمقروء", "Mark all read")}</button></div>` : ""}<div class="stack">${S.ntab === "alerts" ? alerts : ann}</div></div>`);
  };
  S.draw = draw; draw();
  api("notif_read", { all: 1 }).catch(() => {}); S.unread = 0; setBadge();
});
function setBadge() { const b = $("#bdg"); if (b) { b.hidden = !S.unread; b.textContent = S.unread > 99 ? "99+" : S.unread; } }
async function notifPoll() {
  if (!S.token || document.hidden) return;
  try {
    const r = await api("notif_poll"); S.unread = r.unread; setBadge();
    if (r.last_id && r.last_id > S.lastNotif) {
      if (S.lastNotif && S.notif) { toast(ar() ? r.title : r.title_en || r.title, ""); playTone(S.tone); }
      S.lastNotif = r.last_id; LS.set("lastnotif", r.last_id);
    }
    const q = await api("support_poll"); S.supUnread = q.unread; const sb = $("#supb"); if (sb) { sb.hidden = !q.unread; sb.textContent = q.unread; }
    if (q.last_id && q.last_id > S.lastSup) {
      if (S.lastSup && S.notif && !location.hash.startsWith("#/support")) { toast(`${T("رد جديد من الدعم", "New reply from support")}: ${q.body}`.slice(0, 120), ""); playTone(S.tone); }
      S.lastSup = q.last_id; LS.set("lastsup", q.last_id);
    }
  } catch {}
}
setInterval(notifPoll, 15000);

/* ---------- support ---------- */
on(/^\/support$/, async () => {
  let last = -1;
  view(`<div class="page"><div class="h2" style="margin-top:4px">${T("دعم العملاء", "Customer support")}</div><div class="chat" id="ch"></div></div><div class="cbox"><input id="mi" maxlength="1000" placeholder="${T("اكتب رسالتك…", "Type a message…")}"><button id="ms">➤</button></div>`);
  const load = async () => {
    const r = await api("support_list"); const key = r.messages.length + ":" + (r.messages.at(-1)?.id || 0); if (key === last) return;
    const first = last === -1; last = key; const c = $("#ch"); if (!c) return;
    c.innerHTML = r.messages.map((m) => `<div class="msg ${m.sender === "user" ? "u" : "a"}">${esc(m.body)}<small>${fmtD(m.created_at)}</small></div>`).join("") || `<div class="empty">${T("ابدأ المحادثة مع الدعم", "Start a conversation with support")}</div>`;
    window.scrollTo(0, document.body.scrollHeight);
  };
  const send = async () => { const i = $("#mi"), v = i.value.trim(); if (!v) return; i.value = ""; try { await api("support_send", { body: v }); last = -1; load(); } catch (e) { toast(errMsg(e), "e"); i.value = v; } };
  $("#ms").onclick = send; $("#mi").onkeydown = (e) => e.key === "Enter" && send();
  poll(() => load().catch(() => {}), 4000);
});

/* ---------- account / settings ---------- */
const toneNames = { soft_bell: ["جرس ناعم", "Soft bell"], bell: ["جرس", "Bell"], marimba: ["ماريمبا", "Marimba"], harp: ["هارب", "Harp"], bubble: ["فقاعة", "Bubble"], digital: ["رقمي", "Digital"], loud: ["عالٍ", "Loud"], calm: ["هادئ", "Calm"], ding: ["دينغ", "Ding"], silent: ["صامت", "Silent"] };
const toneName = (t) => T(...toneNames[t]);
const tonesHtml = () => TONES.map((t) => `<div class="row" style="padding:6px 0"><label class="sp" style="margin:0;cursor:pointer"><input type="radio" name="tn" ${S.tone === t ? "checked" : ""} data-a="tone" data-v="${t}"> ${esc(toneName(t))}</label><button class="btn sm ln" data-a="prev" data-v="${t}">▶</button></div>`).join("");
const setRow = (icon, label, val, attrs, extra = "") => `<div class="srow" ${attrs}><span class="si">${ic(icon)}</span><span class="sp">${label}${val ? `<small>${val}</small>` : ""}</span>${extra}</div>`;
const notifRow = () => setRow("bell", T("الإشعارات", "Notifications"), S.notif ? T("مفعّلة", "On") : T("متوقفة — لن تصلك أي إشعارات", "Notifications are off"), 'data-a="notiftoggle"', `<span class="sw ${S.notif ? "on" : ""}"></span>`);
on(/^\/account$/, async () => {
  await refreshMe(); const u = S.user;
  const chev = `<span class="chev">›</span>`;
  view(`<div class="page stack"><div class="card stack" style="text-align:center"><div style="width:84px;height:84px;border-radius:50%;margin:auto;overflow:hidden;background:var(--field);display:grid;place-items:center">${u.avatar ? `<img src="${esc(u.avatar)}" style="width:100%;height:100%;object-fit:cover" alt="">` : ic("user")}</div>
    <b style="font-size:18px">${esc(u.username)}</b><div class="mut">${esc(u.email)}</div><input type="file" id="av" accept="image/*" hidden>
    <div class="row" style="justify-content:center"><button class="btn sm dk" data-a="avatar">${T("تغيير الصورة", "Change photo")}</button>${u.avatar ? `<button class="btn sm ln" data-a="avatarrm">${T("حذف", "Remove")}</button>` : ""}</div>
    <div class="row"><input class="in sp" id="nm" value="${esc(u.username)}"><button class="btn sm dk" data-a="rename">${T("حفظ الاسم", "Save name")}</button></div><div id="e"></div></div>
    <div class="h2" style="margin:6px 2px 0">${T("الإعدادات", "Settings")}</div>
    <div class="card sets">
      ${setRow("globe", T("اللغة", "Language"), LANGS[S.lang], 'data-a="langsheet"', chev)}
      <div class="srow" style="cursor:default"><span class="si">${ic("home")}</span><span class="sp">${T("المظهر", "Theme")}</span><div class="seg" style="min-width:150px"><button class="${S.theme === "light" ? "on" : ""}" data-a="settheme" data-v="light">${T("فاتح", "Light")}</button><button class="${S.theme === "dark" ? "on" : ""}" data-a="settheme" data-v="dark">${T("داكن", "Dark")}</button></div></div>
      <div id="nrow">${notifRow()}</div>
      <div id="trow" style="${S.notif ? "" : "opacity:.45"}">${setRow("bell", T("نغمة الإشعارات", "Notification tone"), toneName(S.tone), 'data-a="tonesheet"', chev)}</div>
      ${setRow("chat", T("الدعم", "Support"), "", 'data-a="nav" data-v="/support"', (S.supUnread ? `<span class="st r">${S.supUnread}</span>` : "") + chev)}
      ${setRow("bell", T("التنبيهات", "Alerts"), T("التنبيهات والإعلانات المهمة", "Alerts & announcements"), 'data-a="nav" data-v="/notifs"', (S.unread ? `<span class="st r">${S.unread}</span>` : "") + chev)}
      ${setRow("farm", T("مشترياتي (المزارع)", "My purchases (farms)"), "", 'data-a="nav" data-v="/my-farms"', chev)}
      ${setRow("bag", T("طلبات المنتجات والأدوات", "Product & tool orders"), "", 'data-a="nav" data-v="/my-orders"', chev)}
      ${setRow("link", T("البحث عن تحديث", "Check for update"), `${T("الإصدار", "Version")} ${APP_VER}`, 'data-a="chkupd"', chev)}
    </div>
    <button class="btn rd" style="margin-top:6px" data-a="logoutask">${T("تسجيل الخروج", "Sign out")}</button></div>`);
});
on(/^\/my-farms$/, async () => {
  const draw = async () => { const r = await api("orders"); const f = r.orders.filter((o) => o.kind === "farm"); const v = $("#mf"); if (!v) return;
    v.innerHTML = f.map((o) => `<div class="card stack"><div class="row"><b class="sp">${esc(o.name)}</b>${stBadge(o.status)}</div>
      <div class="row mut"><span class="sp">${T("تاريخ الشراء", "Purchase date")}</span><span>${fmtD(o.created_at)}</span></div>
      <div class="row mut"><span class="sp">${T("السعر", "Price")}</span><b style="color:var(--ink)">${amt(o.total, o.currency)}</b></div><div class="mut">#${o.id}</div>
      ${o.delivery ? `<div class="mut">${T("بيانات المزرعة", "Farm credentials")}</div><div class="code">${esc(o.delivery)}</div><button class="btn sm dk" data-a="copy" data-v="${esc(o.delivery)}">${ic("copy")} ${T("نسخ", "Copy")}</button>` : o.status === "cancelled" ? "" : `<div class="mut">${T("بانتظار تسليم الإدارة", "Waiting for admin delivery")}</div>`}</div>`).join("") || `<div class="empty">${T("لا مشتريات بعد", "No farm purchases yet")}</div>`; };
  view(`<div class="page">${back("/account")}<div class="h2" style="margin-top:4px">${T("مشترياتي (المزارع)", "My purchases (farms)")}</div><div class="stack" id="mf"></div></div>`);
  poll(() => draw().catch(() => {}), 10000);
});
on(/^\/my-orders$/, async () => {
  const draw = async () => { const r = await api("orders"); const f = r.orders.filter((o) => o.kind === "tool" || o.kind === "opt"); const v = $("#mo"); if (v) v.innerHTML = f.map(orderCard).join("") || `<div class="empty">${T("لا طلبات بعد", "No product orders yet")}</div>`; };
  view(`<div class="page">${back("/account")}<div class="h2" style="margin-top:4px">${T("طلبات المنتجات والأدوات", "Product & tool orders")}</div><div class="stack" id="mo"></div></div>`);
  poll(() => draw().catch(() => {}), 10000);
});
async function checkUpdate() {
  toast(T("جارٍ البحث عن تحديث…", "Checking…"));
  try {
    const r = await api("config", {}, false); S.cfg = r; const u = r.update || {};
    if (u.version && cmpVer(u.version, APP_VER) > 0) {
      sheet(`<h3>${T("يتوفر إصدار جديد", "New version available")} ${esc(u.version)}</h3>${u.notes ? `<p style="white-space:pre-wrap;margin-bottom:12px">${esc(u.notes)}</p>` : ""}${u.url ? `<a class="btn" href="${esc(u.url)}" target="_blank" rel="noopener" onclick="closeSheet()">${T("تحديث التطبيق", "Update now")}</a>` : ""}<button class="btn ln" style="margin-top:8px" onclick="closeSheet()">${T("إلغاء", "Cancel")}</button>`);
    } else toast(T("أنت على أحدث إصدار", "You are on the latest version"), "s");
  } catch (e) { toast(errMsg(e), "e"); }
}
/* ---------- actions ---------- */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-a]"); if (!el) return;
  const a = el.dataset.a, id = el.dataset.id, v = el.dataset.v;
  if (el.tagName === "INPUT" && el.type !== "radio") return;
  if (a === "setlang") { S.lang = v; LS.set("lang", S.lang); applyPrefs(); closeSheet(); route(); }
  else if (a === "settheme") { S.theme = v; LS.set("theme", v); applyPrefs(); route(); }
  else if (a === "cur") { S.cur = v; LS.set("cur", v); route(); }
  else if (a === "acct") go("/account");
  else if (a === "bell") go("/notifs");
  else if (a === "copy") copy(v);
  else if (a === "optinc") setOpt(id, (S.opt[id] || 0) + 1);
  else if (a === "optdec") setOpt(id, (S.opt[id] || 0) - 1);
  else if (a === "optclear") { S.opt = {}; LS.set("optcart", {}); route(); }
  else if (a === "paste") pasteList();
  else if (a === "optbuy") {
    const items = Object.entries(S.opt).map(([i, q]) => ({ id: +i, q })), O = S.optItems.items;
    buySheet({ title: T("تأكيد طلب منتجات اختياري", "Confirm optional products order"), usdt: optTotalUsdt(), lines: items.slice(0, 12).map((x) => `${esc(O.find((o) => o.id === x.id)?.n)} × ${x.q}`).join("<br>") + (items.length > 12 ? `<br>… +${items.length - 12}` : ""),
      run: async (cur, key) => { const r = await api("checkout", { kind: "opt", lines: items, currency: cur, idem_key: key }); S.opt = {}; LS.set("optcart", {}); placed(r.order); return r; } });
  }
  else if (a === "cinc") setCart(id, (S.cart[id] || 0) + 1);
  else if (a === "cdec") { setCart(id, (S.cart[id] || 0) - 1); if ($("#ctot")) route(); }
  else if (a === "cartbuy") {
    const items = Object.entries(S.cart).map(([i, q]) => ({ id: +i, q })), P = S.catalog.products;
    buySheet({ title: T("تأكيد طلب الأدوات", "Confirm tools order"), usdt: cartUsdt(), lines: items.map((x) => `${esc(P.find((p) => p.id === x.id)?.name)} × ${x.q}`).join("<br>"),
      run: async (cur, key) => { const r = await api("checkout", { kind: "cart", lines: items, currency: cur, idem_key: key }); S.cart = {}; LS.set("cart", {}); S.catalog = null; placed(r.order); return r; } });
  }
  else if (a === "codebuy") {
    const c = S.codes.find((x) => x.id == id), mx = Math.min(10, c.stock); let n = 1;
    const o = { get n() { return n; } };
    buySheet({ title: c.name, usdt: c.price, extra: `<div class="row" style="margin:8px 0"><span class="sp">${T("الكمية", "Quantity")}</span><div class="stp"><button id="qd">−</button><b id="qn">1</b><button id="qi">+</button></div></div>`, run: async (cur, key) => { const r = await api("code_buy", { id: c.id, qty: n, currency: cur, idem_key: key }); placed(r.order); return r; } });
    // quantity changes re-price: simple approach — reopen sheet with new usdt
    const rebind = () => { const d = $("#qd"), i = $("#qi"); if (!d) return; d.onclick = () => { if (n > 1) { n--; reopen(); } }; i.onclick = () => { if (n < mx) { n++; reopen(); } }; };
    const reopen = () => { buySheet({ title: `${c.name} × ${n}`, usdt: c.price * n, extra: `<div class="row" style="margin:8px 0"><span class="sp">${T("الكمية", "Quantity")}</span><div class="stp"><button id="qd">−</button><b id="qn">${n}</b><button id="qi">+</button></div></div>`, run: async (cur, key) => { const r = await api("code_buy", { id: c.id, qty: n, currency: cur, idem_key: key }); placed(r.order); return r; } }); setTimeout(rebind, 0); };
    setTimeout(rebind, 0);
  }
  else if (a === "boxbuy") {
    const b = S.boxes.find((x) => x.id == id);
    buySheet({ title: b.name, usdt: b.price, lines: T("الجائزة تُحدَّد عشوائيًا من الخادم.", "The prize is picked randomly by the server."), run: async (cur, key) => {
      const r = await api("random_buy", { id: b.id, currency: cur, idem_key: key }); const prize = r.order.lines?.[0]?.prize || "";
      view(`<div class="page"><div class="card reveal"><div class="spin" id="rv"></div></div></div>`);
      setTimeout(() => view(`<div class="page"><div class="card reveal"><div style="font-size:48px">🎁</div><div class="mut">${T("ربحت", "You won")}</div><div class="pz">${esc(prize)}</div><div class="mut">#${r.order.id}</div><a class="btn" href="#/orders" style="margin-top:12px">${T("طلباتي", "My orders")}</a><a class="btn ln" href="#/boxes" style="margin-top:8px">${T("افتح آخر", "Open another")}</a></div></div>`), 1400);
      return r; } });
  }
  else if (a === "readall") { await api("notif_read", { all: 1 }).catch(() => {}); route(); }
  else if (a === "notif") { api("notif_read", { id }).catch(() => {}); const ref = el.dataset.ref || ""; if (ref.startsWith("DEP-")) go("/tx/" + ref); else if (ref.startsWith("ORD-")) go("/orders"); else el.style.opacity = ".7"; }
  else if (a === "tone") { S.tone = v; LS.set("tone", v); playTone(v); if (S.notif) shell({ type: "tone", tone: v, token: S.token }); const tr = $("#trow"); if (tr) tr.innerHTML = setRow("bell", T("نغمة الإشعارات", "Notification tone"), toneName(v), 'data-a="tonesheet"', `<span class="chev">›</span>`); }
  else if (a === "prev") playTone(v);
  else if (a === "avatar") $("#av").click();
  else if (a === "avatarrm") { try { const r = await api("profile", { avatar: null }); S.user = { ...S.user, ...r }; LS.set("user", S.user); route(); } catch (e) { toast(errMsg(e), "e"); } }
  else if (a === "rename") { try { const r = await api("profile", { username: $("#nm").value }); S.user = { ...S.user, ...r }; LS.set("user", S.user); toast(T("تم الحفظ", "Saved"), "s"); } catch (e) { $("#e").innerHTML = `<div class="err">${esc(errMsg(e))}${e.days ? ` (${e.days} ${T("يوم", "days")})` : ""}</div>`; } }
  else if (a === "nav") go(v);
  else if (a === "ntab") { S.ntab = v; S.draw && S.draw(); }
  else if (a === "langsheet" || a === "lang") {
    sheet(`<h3>${T("اللغة", "Choose language")}</h3>${Object.entries(LANGS).map(([k, n]) => `<button class="btn ${k === S.lang ? "" : "ln"}" style="margin-bottom:8px" data-a="setlang" data-v="${k}">${n}</button>`).join("")}`);
  }
  else if (a === "tonesheet") { if (!S.notif) return; sheet(`<h3>${T("نغمة الإشعارات", "Notification tone")}</h3><div>${tonesHtml()}</div><button class="btn" style="margin-top:10px" onclick="closeSheet()">${T("حفظ", "Save")}</button>`); }
  else if (a === "notiftoggle") {
    S.notif = !S.notif; LS.set("notif", S.notif);
    $("#nrow").innerHTML = notifRow(); $("#trow").style.opacity = S.notif ? "" : ".45";
    if (S.notif) { shell({ type: "login", token: S.token, tone: S.tone }); toast(T("تم تفعيل الإشعارات", "Notifications on"), "s"); }
    else { api("push_unregister").catch(() => {}); toast(T("تم إيقاف الإشعارات", "Notifications are off")); }
  }
  else if (a === "chkupd") checkUpdate();
  else if (a === "logoutask") sheet(`<h3>${T("تسجيل الخروج", "Sign out")}</h3><p style="margin-bottom:14px">${T("هل أنت متأكد أنك تريد تسجيل الخروج؟", "Are you sure you want to sign out?")}</p><button class="btn rd" data-a="logoutyes">${T("نعم، تسجيل الخروج", "Yes, sign out")}</button><button class="btn ln" style="margin-top:8px" onclick="closeSheet()">${T("إلغاء", "Cancel")}</button>`);
  else if (a === "logoutyes") { closeSheet(); logout(); }
});
document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.id === "av" && el.files[0]) { try { const data = await fileToData(el.files[0], 400000); const r = await api("profile", { avatar: data }); S.user = { ...S.user, ...r }; LS.set("user", S.user); route(); } catch (e) { toast(e?.error ? errMsg(e) : T("تعذّرت معالجة الصورة", "Could not process image"), "e"); } }
  else if (el.dataset.a === "optset") setOpt(el.dataset.id, +el.value);
  else if (el.dataset.a === "cset") setCart(el.dataset.id, +el.value);
});

/* ---------- boot ---------- */
window.addEventListener("hashchange", route);
window.addEventListener("online", () => { $("#off").hidden = true; route(); });
window.addEventListener("offline", () => { const o = $("#off"); o.textContent = T("لا يوجد اتصال بالإنترنت", "You are offline"); o.hidden = false; });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { notifPoll(); } });
window.addEventListener("message", () => {});
applyPrefs();
if (S.token && S.notif) shell({ type: "login", token: S.token, tone: S.tone });
(async () => {
  try { await loadCfg(); } catch {}
  const u = S.cfg?.update;
  if (u && u.force && u.url && cmpVer(u.version, APP_VER) > 0) { $("#app").innerHTML = `<div class="full"><div><img src="/img/logo-192.png" width="90" style="border-radius:22px"><h2 style="margin:14px 0 6px">${T("يتوفر إصدار جديد", "New version available")} ${esc(u.version)}</h2><p class="mut" style="white-space:pre-wrap">${esc(u.notes || "")}</p><a class="btn" style="margin-top:16px" href="${esc(u.url)}" target="_blank" rel="noopener">${T("تحديث التطبيق", "Update now")}</a></div></div>`; return; }
  route(); notifPoll();
})();
