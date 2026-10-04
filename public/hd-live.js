/* HD Market web: live features connected to the server/admin panel.
   Loaded after the main script in index.html. */
(function () {
  "use strict";
  const HD = { cfg: null, cats: [], prods: [], orders: [], topups: [], msgs: [], sel: null, rc: null, qty: {}, open: 0, tick: 0 };
  const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n || 0);
  const money = (n) => num(n).toFixed(2);
  const bal = () => (ME ? num(ME.balance) : 0);

  const X = {
    ar: { pack: "العدد", limit: "الحد المسموح", e_limit: "تجاوزت الحد المسموح للطلب الواحد.", maint: "تحت الصيانة", retry: "إعادة المحاولة", items: "عنصر", nocat: "لا توجد أقسام بعد.", noprod: "لا توجد منتجات في هذا القسم.", price: "السعر", qty: "العدد", buy: "شراء", sold: "نفد", total: "الإجمالي",
      confirm: "تأكيد الشراء؟", bought: "تم تقديم الطلب", e_bal: "رصيدك غير كافٍ. اشحن رصيدك أولًا.", e_stock: "الكمية غير متوفرة.", e_net: "تعذّر الاتصال بالخادم.", e_gen: "حدث خطأ. حاول مجددًا.", e_many: "طلبات كثيرة. حاول لاحقًا.",
      noorders: "لا توجد طلبات بعد.", s_new: "جديد", s_processing: "قيد التنفيذ", s_done: "مكتمل", s_cancelled: "ملغي",
      pay: "محافظ الدفع", paynum: "رقم الدفع", copy: "نسخ", copied: "تم النسخ", topup: "شحن الرصيد", amount: "المبلغ", pick: "اختيار صورة إيصال الدفع", send: "إرسال طلب الشحن",
      hist: "طلبات الشحن", nohist: "لا توجد طلبات شحن.", t_pending: "قيد المراجعة", t_approved: "تمت الموافقة", t_rejected: "مرفوض", need: "اختر المحفظة وأدخل المبلغ وأرفق صورة الإيصال.", topsent: "تم إرسال طلب الشحن وسيتم مراجعته.",
      typemsg: "اكتب رسالتك...", sendm: "إرسال", nomsg: "ابدأ المحادثة مع الدعم.", nowal: "لا توجد محافظ دفع حالياً." },
    en: { pack: "Count", limit: "Max per order", e_limit: "Over the per-order limit.", maint: "Under maintenance", retry: "Try again", items: "items", nocat: "No sections yet.", noprod: "No products in this section.", price: "Price", qty: "Qty", buy: "Buy", sold: "Sold out", total: "Total",
      confirm: "Confirm purchase?", bought: "Order placed", e_bal: "Insufficient balance. Top up first.", e_stock: "Not enough stock.", e_net: "Can't reach the server.", e_gen: "Something went wrong. Try again.", e_many: "Too many requests. Try later.",
      noorders: "No orders yet.", s_new: "New", s_processing: "Processing", s_done: "Completed", s_cancelled: "Cancelled",
      pay: "Payment wallets", paynum: "Payment number", copy: "Copy", copied: "Copied", topup: "Top up balance", amount: "Amount", pick: "Choose payment receipt image", send: "Submit top-up request",
      hist: "Top-up requests", nohist: "No top-up requests.", t_pending: "Pending", t_approved: "Approved", t_rejected: "Rejected", need: "Choose a wallet, enter the amount and attach the receipt.", topsent: "Top-up request sent. It will be reviewed.",
      typemsg: "Type your message...", sendm: "Send", nomsg: "Start a conversation with support.", nowal: "No payment wallets available." },
  };
  const xt = (k) => (L === "ar" ? X.ar[k] : X.en[k]) ?? X.en[k] ?? k;
  const errMsg = (c) => ({ insufficient_balance: xt("e_bal"), out_of_stock: xt("e_stock"), limit_exceeded: xt("e_limit"), network: xt("e_net"), too_many: xt("e_many") }[c] || xt("e_gen"));

  const css = document.createElement("style");
  css.textContent = `.xb{position:sticky;top:0;z-index:40;background:#E8A900;color:#111;text-align:center;font-weight:800;padding:9px 12px;font-size:14px}
.xm{position:fixed;inset:0;z-index:999;background:var(--bg);display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.xm h2{font-size:26px;margin:10px 0}.xm p{color:var(--mute);margin-bottom:20px;line-height:1.6}
.xbtn{border:0;border-radius:12px;background:var(--btn);color:var(--btnink);font:800 15px inherit;font-family:inherit;padding:10px 16px;cursor:pointer}
.xs{width:34px;height:34px;border:0;border-radius:10px;background:var(--field);color:var(--ink);font-size:20px;cursor:pointer}
.xc{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;margin-bottom:12px}
.xc small,.xpi small{color:var(--mute);display:block;margin-top:4px}
.xr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}.xr.sp{justify-content:space-between;margin-top:0}
.xchip{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:800;background:var(--field)}
.xchip.st-new,.xchip.t-pending{background:#FFF3CD;color:#6b5200}.xchip.st-done,.xchip.t-approved{background:#E6F4E6;color:#1b6b1b}.xchip.st-cancelled,.xchip.t-rejected,.xchip.bad{background:#FDE8E8;color:#b71c1c}.xchip.st-processing{background:#DCEBFF;color:#1a4fa0}
.xin{width:100%;height:50px;border-radius:14px;border:1.5px solid var(--line);background:var(--field);color:var(--ink);font:600 16px inherit;font-family:inherit;padding-inline:14px;margin:6px 0}
.xfile{display:flex;align-items:center;justify-content:center;height:50px;border-radius:14px;border:1.5px dashed var(--ink);font-weight:800;cursor:pointer;margin:8px 0}
.xrp{width:100%;max-height:220px;object-fit:contain;border-radius:14px;margin:6px 0 10px}
.xw{display:flex;align-items:center;gap:10px;background:var(--card);border:2px solid var(--line);border-radius:16px;padding:10px;margin-bottom:10px;cursor:pointer}
.xw.on{border-color:var(--ink)}.xw img,.xw .xph{width:46px;height:46px;border-radius:12px;object-fit:cover;background:var(--field);flex:none}
.xw .xwi{flex:1;min-width:0}.xw b{display:block}.xw small{color:var(--mute)}.xw bdi{font-weight:800;color:var(--ink)}
.xp{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.xp img,.xp .xph{width:78px;height:78px;border-radius:14px;object-fit:cover;background:var(--field);flex:none}.xpi{flex:1;min-width:0}
.xi2{width:100%;height:100%;object-fit:cover;border-radius:14px}
.xchat{display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto;margin-bottom:12px;padding:4px 0}
.xmg{max-width:82%;padding:9px 13px;border-radius:16px;white-space:pre-wrap;line-height:1.5;font-weight:600}
.xmg.me{align-self:flex-end;background:var(--btn);color:var(--btnink)}.xmg.ad{align-self:flex-start;background:var(--card);border:1px solid var(--line)}
.xmg small{display:block;opacity:.6;font-size:11px;margin-top:2px}`;
  document.head.appendChild(css);

  /* ---------- banner + maintenance ---------- */
  function applyCfg() {
    const c = HD.cfg;
    if (!c) return;
    let b = document.getElementById("hdb");
    if (!b) { b = document.createElement("div"); b.id = "hdb"; b.className = "xb"; document.body.prepend(b); }
    b.hidden = !(c.banner.on && c.banner.text);
    b.textContent = c.banner.text || "";
    let m = document.getElementById("hdm");
    if (!m) { m = document.createElement("div"); m.id = "hdm"; m.className = "xm"; document.body.appendChild(m); }
    if (c.maintenance.on) {
      m.hidden = false;
      m.innerHTML = `<div><div style="font-size:64px">🛠️</div><h2>${xt("maint")}</h2><p>${E(c.maintenance.message)}</p><button class="xbtn" data-x="retry">${xt("retry")}</button></div>`;
    } else m.hidden = true;
  }
  async function loadCfg() {
    const r = await api("config", {});
    if (r.ok) { HD.cfg = r; applyCfg(); if (!$("app").hidden && tab == 2) paintWallet(); }
  }
  async function refreshMe() {
    if (!TOKEN) return;
    const r = await api("me", { token: TOKEN });
    if (r.ok) ME = r; else if (r.error == "unauthorized") sessionOut();
    document.querySelectorAll(".wal b").forEach((el) => (el.textContent = money(bal())));
  }

  /* ---------- store (admin sections) ---------- */
  async function loadCat() {
    const r = await api("catalog", {});
    if (!r.ok) return;
    HD.cats = r.categories; HD.prods = r.products;
    if (!$("app").hidden && tab == 0 && !axe && !opt) drawGrid();
    if ($("sheet").classList.contains("show") && HD.open) openXCat(HD.open);
  }
  drawGrid = function () {
    const g = $("cg");
    if (!g) return;
    const q = (term || "").toLowerCase();
    const cats = HD.cats.filter((c) => !q || c.name.toLowerCase().includes(q) || HD.prods.some((p) => p.category_id == c.id && p.name.toLowerCase().includes(q)));
    g.innerHTML = cats.length
      ? cats.map((c) => `<div class="cc" style="--t:rgba(245,180,0,.18)" data-x="cat:${c.id}"><div class="pic">${c.image ? `<img class="xi2" src="${E(c.image)}" alt="">` : "🏪"}</div><h3>${E(c.name)}</h3><small>${HD.prods.filter((p) => p.category_id == c.id).length} ${xt("items")}</small><span class="go2"></span></div>`).join("")
      : `<p class="empty" style="grid-column:1/-1">${xt("nocat")}</p>`;
  };
  function openXCat(id) {
    const c = HD.cats.find((x) => x.id == id);
    if (!c) return;
    HD.open = id;
    const ps = HD.prods.filter((p) => p.category_id == id);
    $("panel").innerHTML = `<h2>${E(c.name)}</h2>` + (ps.length ? ps.map((p) => {
      const cap = p.max_order > 0 ? Math.min(p.qty, p.max_order) : p.qty;
      const q = Math.min(HD.qty[p.id] || 1, Math.max(1, cap));
      return `<div class="xp">${p.image ? `<img src="${E(p.image)}" alt="">` : `<div class="xph"></div>`}<div class="xpi"><b>${E(p.name)}</b><small>${xt("price")}: <b>${money(p.price)}</b> · ${xt("qty")}: ${p.qty}${p.pack > 1 ? ` · ${xt("pack")}: ${p.pack}` : ""}</small>${p.max_order > 0 ? `<span class="xchip">${xt("limit")}: ${p.max_order}</span>` : ""}` +
        (p.qty > 0 ? `<div class="xr"><button class="xs" data-x="q:${p.id}:-1">−</button><b>${q}</b><button class="xs" data-x="q:${p.id}:1">+</button><button class="xbtn" data-x="buy:${p.id}">${xt("buy")}</button></div>` : `<span class="xchip bad">${xt("sold")}</span>`) + `</div></div>`;
    }).join("") : `<p class="empty">${xt("noprod")}</p>`);
    $("sheet").classList.add("show");
  }
  async function buy(id) {
    const p = HD.prods.find((x) => x.id == id);
    if (!p) return;
    const q = Math.min(HD.qty[id] || 1, p.max_order > 0 ? Math.min(p.qty, p.max_order) : p.qty);
    if (!confirm(`${p.name}\n${xt("confirm")}\n${xt("qty")}: ${q}\n${xt("total")}: ${money(p.price * q)}`)) return;
    const r = await api("order_create", { token: TOKEN, product_id: id, qty: q });
    if (r.ok) { ME.balance = r.balance; HD.qty[id] = 1; toast(xt("bought")); await loadCat(); document.querySelectorAll(".wal b").forEach((el) => (el.textContent = money(bal()))); }
    else if (r.error == "unauthorized") sessionOut();
    else toast(errMsg(r.error));
  }

  /* ---------- orders ---------- */
  async function loadOrders() {
    const r = await api("orders", { token: TOKEN });
    if (r.ok) HD.orders = r.orders; else if (r.error == "unauthorized") return sessionOut();
    paintOrders();
  }
  function paintOrders() {
    const el = $("xol");
    if (!el) return;
    el.innerHTML = HD.orders.length ? HD.orders.map((o) => `<div class="xc"><div class="xr sp"><b>#${o.id} · ${E(o.product_name)}</b><span class="xchip st-${E(o.status)}">${xt("s_" + o.status)}</span></div><small>${xt("qty")}: ${o.qty} · ${xt("total")}: ${money(o.total)} · ${new Date(o.created_at * 1000).toLocaleString(LOC[L])}</small></div>`).join("") : `<p class="empty">${xt("noorders")}</p>`;
  }

  /* ---------- wallet / top-up ---------- */
  function paintWallet() {
    const el = $("xw");
    if (!el) return;
    const ws = (HD.cfg && HD.cfg.wallets) || [];
    el.innerHTML = ws.length ? ws.map((w) => `<div class="xw ${HD.sel == w.id ? "on" : ""}" data-x="sel:${w.id}">${w.icon ? `<img src="${E(w.icon)}" alt="">` : `<div class="xph"></div>`}<div class="xwi"><b>${E(w.name)}</b><small>${xt("paynum")}: <bdi dir="ltr">${E(w.number)}</bdi></small></div><button class="xbtn" data-x="copy:${w.id}">${xt("copy")}</button></div>`).join("") : `<p class="empty">${xt("nowal")}</p>`;
  }
  function paintHist() {
    const el = $("xh");
    if (!el) return;
    el.innerHTML = HD.topups.length ? HD.topups.map((t) => `<div class="xc"><div class="xr sp"><b>${money(t.amount)} · ${E(t.wallet_name)}</b><span class="xchip t-${E(t.status)}">${xt("t_" + t.status)}</span></div>${t.note ? `<small>${E(t.note)}</small>` : ""}<small>${new Date(t.created_at * 1000).toLocaleString(LOC[L])}</small></div>`).join("") : `<p class="empty">${xt("nohist")}</p>`;
  }
  async function loadWalletData() {
    await refreshMe();
    const r = await api("topups", { token: TOKEN });
    if (r.ok) { HD.topups = r.topups; paintHist(); }
  }
  function drawWallet() {
    $("view").innerHTML = wallet() + `<div class="pad"><h2>${xt("pay")}</h2><div id="xw"></div><h2 style="margin-top:18px">${xt("topup")}</h2>
      <input class="xin" id="xamt" inputmode="decimal" placeholder="${xt("amount")}" autocomplete="off">
      <label class="xfile"><input type="file" id="xrc" accept="image/*" hidden>${xt("pick")}</label>
      <img id="xrp" class="xrp" alt="" hidden>
      <button class="go" data-x="topup"><span>${xt("send")}</span></button>
      <h2 style="margin-top:22px">${xt("hist")}</h2><div id="xh"></div></div>`;
    HD.rc = null; paintWallet(); paintHist(); loadWalletData(); loadCfg();
  }
  function resizeImg(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        let d = "";
        for (const q of [0.7, 0.5, 0.35, 0.2]) { d = c.toDataURL("image/jpeg", q); if (d.length < 440000) break; }
        cb(d.length < 450000 ? d : null);
      };
      im.onerror = () => cb(null);
      im.src = r.result;
    };
    r.onerror = () => cb(null);
    r.readAsDataURL(file);
  }
  async function submitTopup() {
    const a = parseFloat(String($("xamt").value).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(",", "."));
    if (!HD.sel || !HD.rc || !(a > 0)) return toast(xt("need"));
    const r = await api("topup_create", { token: TOKEN, wallet_id: HD.sel, amount: a, receipt: HD.rc });
    if (r.ok) { toast(xt("topsent")); HD.rc = null; $("xamt").value = ""; $("xrp").hidden = true; loadWalletData(); }
    else if (r.error == "unauthorized") sessionOut(); else toast(errMsg(r.error));
  }
  function copyText(t, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = xt("copied"); setTimeout(() => (btn.textContent = xt("copy")), 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallback());
    else fallback();
    function fallback() { const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done(); }
  }

  /* ---------- support chat ---------- */
  function paintChat(force) {
    const el = $("xlist");
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = HD.msgs.length ? HD.msgs.map((m) => `<div class="xmg ${m.sender == "user" ? "me" : "ad"}">${E(m.body)}<small>${new Date(m.created_at * 1000).toLocaleTimeString(LOC[L], { hour: "2-digit", minute: "2-digit" })}</small></div>`).join("") : `<p class="empty">${xt("nomsg")}</p>`;
    if (force || bottom) el.scrollTop = el.scrollHeight;
  }
  async function loadChat(force) {
    const r = await api("support_list", { token: TOKEN });
    if (r.ok) { HD.msgs = r.messages; paintChat(force); } else if (r.error == "unauthorized") sessionOut();
  }
  function drawChat() {
    $("view").innerHTML = `<div class="pad"><h2>${S[L].nav[tab]}</h2><div class="xchat" id="xlist"></div><div class="xr" style="flex-wrap:nowrap"><input class="xin" id="xmsg" maxlength="1000" placeholder="${xt("typemsg")}" autocomplete="off" style="margin:0"><button class="xbtn" data-x="send" style="height:50px">${xt("sendm")}</button></div></div>`;
    paintChat(true); loadChat(true);
  }
  async function sendMsg() {
    const i = $("xmsg"), body = i.value.trim();
    if (!body) return;
    i.value = "";
    const r = await api("support_send", { token: TOKEN, body });
    if (r.ok) loadChat(true); else { i.value = body; if (r.error == "unauthorized") sessionOut(); else toast(errMsg(r.error)); }
  }

  /* ---------- hook into the existing app ---------- */
  const _draw = drawShop;
  drawShop = function () {
    _draw();
    if (axe || opt) return;
    const v = $("view");
    if (tab == 0) { const t = v.querySelector(".tiles"); if (t) t.remove(); const f = v.querySelector(".sh .fv"); if (f) f.remove(); }
    else if (tab == 1) { v.innerHTML = `<div class="pad"><h2>${S[L].nav[1]}</h2><div id="xol"></div></div>`; paintOrders(); loadOrders(); }
    else if (tab == 2) drawWallet();
    else if (tab == 3 || tab == 4) drawChat();
  };
  wallet = function () {
    const s = S[L];
    return `<div class="wal"><div class="wic">👛</div><div class="wi"><small>${s.bal}</small><div class="wr"><b>${money(bal())}</b></div></div><button class="tp" data-x="top">${s.top}</button></div>`;
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-x]");
    if (!b) return;
    const [a, i, d] = b.dataset.x.split(":");
    if (a == "cat") openXCat(+i);
    else if (a == "q") { const p = HD.prods.find((x) => x.id == i); if (p) { HD.qty[i] = Math.max(1, Math.min(p.max_order > 0 ? Math.min(p.qty, p.max_order) : p.qty, (HD.qty[i] || 1) + +d)); openXCat(HD.open); } }
    else if (a == "buy") buy(+i);
    else if (a == "top") { tab = 2; drawShop(); scrollTo(0, 0); }
    else if (a == "sel") { HD.sel = +i; paintWallet(); }
    else if (a == "copy") { e.stopPropagation(); const w = ((HD.cfg && HD.cfg.wallets) || []).find((x) => x.id == i); if (w) copyText(w.number, b); }
    else if (a == "topup") submitTopup();
    else if (a == "send") sendMsg();
    else if (a == "retry") loadCfg();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id == "xrc" && e.target.files[0]) resizeImg(e.target.files[0], (d) => {
      if (!d) return toast(xt("e_gen"));
      HD.rc = d; const p = $("xrp"); p.src = d; p.hidden = false;
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key == "Enter" && e.target.id == "xmsg") { e.preventDefault(); sendMsg(); } });

  setInterval(() => {
    if (document.hidden) return;
    HD.tick++;
    if (HD.tick % 4 == 0) loadCfg();
    if (!TOKEN || $("app").hidden) return;
    if ((tab == 3 || tab == 4) && !axe && !opt) loadChat(false);
    if (HD.tick % 4 == 0) {
      if (tab == 0 && !axe && !opt) loadCat();
      else if (tab == 1) loadOrders();
      else if (tab == 2) loadWalletData();
    }
  }, 5000);

  loadCfg();
  loadCat();
})();
