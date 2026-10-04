// Admin panel: shared UI pieces (icons, styles, layout, translations).
import { h, num, Row } from "./core";
import { WEB_ORIGIN } from "./shop";
import { EN } from "./panel_en";

export type Ctx = { csrf: string; lang: "ar" | "en"; url: URL; tab: string; t: (s: string) => string; F: (act: string, inner: string, extra?: string) => string; hid: (n: string, v: any) => string };

export const mkT = (lang: "ar" | "en") => (s: string) => (lang === "en" ? EN[s] ?? s : s);

const P: Record<string, string> = {
  bag: `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>`,
  truck: `<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>`,
  list: `<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>`,
  box: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>`,
  key: `<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 5l3 3M14 8l2 2"/>`,
  wallet: `<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>`,
  card: `<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>`,
  chart: `<path d="M12 20V10M18 20V4M6 20v-4"/>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>`,
  clock: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
  store: `<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>`,
  home: `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>`,
  tag: `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>`,
  users: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
  headset: `<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>`,
  chat: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  bell: `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`,
  sliders: `<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>`,
  out: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>`,
  globe: `<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
  menu: `<path d="M3 12h18M3 6h18M3 18h18"/>`,
  gift: `<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`,
  link: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
  file: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>`,
  trend: `<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>`,
  check: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10-3-3"/>`,
  user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
};
export const ic = (n: string, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] ?? ""}</svg>`;

// Pastel tile colors (bg / icon) like the reference screenshot.
const TILE = ["#efe9fd/#7c4dff", "#fdebe2/#e4572e", "#e3f6fb/#0e8fb0", "#fde7ef/#d81b60", "#efe9fd/#7c4dff", "#e3f6ec/#1f9d55", "#e2f3f1/#13867a", "#fdf1d9/#d98a00", "#eceff4/#52606d", "#e8f6df/#4a9d1d", "#e4eefc/#2f6fd6", "#f1e8fd/#8a3ffc", "#fdece3/#c8581a", "#fde7ef/#d81b60", "#e3f6fb/#0e8fb0", "#e3f6ec/#1f9d55", "#efe9fd/#7c4dff", "#fdf1d9/#d98a00"];
export const tile = (i: number, icon: string, size = 52) => { const [bg, fg] = TILE[i % TILE.length].split("/"); return `<span class="tl" style="background:${bg};color:${fg};width:${size}px;height:${size}px">${ic(icon, Math.round(size * 0.45))}</span>`; };

export type NavItem = [string, string, string]; // [tab, icon, label]
export const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [["farm_orders", "bag", "طلبات المزارع"], ["farm_delivery", "truck", "تسليم المزارع"], ["tool_orders", "list", "طلبات الأدوات والمنتجات"], ["opt_orders", "box", "طلبات منتجات اختياري"], ["codes", "key", "أكواد الاشتراك وطلباتها"]] },
  { title: "المدفوعات والمحفظة", items: [["deposits", "wallet", "طلبات الشحن"], ["methods", "card", "طرق الدفع"], ["rates", "chart", "أسعار العملات"], ["ledger", "shield", "سجل المحفظة الآمن"], ["deposit_history", "clock", "الإيداعات (السابقة)"]] },
  { title: "المتجر والمنتجات", items: [["categories", "store", "أقسام المتجر والأدوات"], ["farms", "home", "المزارع"], ["farm_data", "key", "بيانات المزارع (ID / Token)"], ["opt_prices", "tag", "منتجات اختياري – الأسعار"], ["random", "box", "المنتجات العشوائية"]] },
  { title: "العملاء والتواصل", items: [["users", "users", "المستخدمون والأرصدة"], ["support", "headset", "دعم العملاء"], ["groups", "chat", "المجموعات"], ["announcements", "bell", "الإعلانات"]] },
  { title: "النظام", items: [["settings", "sliders", "الإعدادات والصيانة"], ["audit", "file", "سجل الإجراءات"]] },
];
export const TAB_LABEL: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i[0], i[2]])));
const TAB_ICON: Record<string, [string, number]> = {};
let k = 0; for (const g of NAV) for (const i of g.items) TAB_ICON[i[0]] = [i[1], k++];
export const tabTile = (tab: string, size = 52) => tile(TAB_ICON[tab]?.[1] ?? 0, TAB_ICON[tab]?.[0] ?? "list", size);

const FLAG_UK = `<svg width="26" height="18" viewBox="0 0 60 40" aria-hidden="true"><clipPath id="u"><path d="M0 0h60v40H0z"/></clipPath><g clip-path="url(#u)"><path d="M0 0v40h60V0z" fill="#012169"/><path d="m0 0 60 40m0-40L0 40" stroke="#fff" stroke-width="8"/><path d="m0 0 60 40m0-40L0 40" stroke="#C8102E" stroke-width="4"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="13"/><path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="8"/></g></svg>`;
const FLAG_AR = `<svg width="26" height="18" viewBox="0 0 60 40" aria-hidden="true"><path d="M0 0h60v13.3H0z" fill="#111"/><path d="M0 13.3h60v13.4H0z" fill="#fff"/><path d="M0 26.7h60V40H0z" fill="#007a3d"/><path d="m0 0 27 20L0 40z" fill="#ce1126"/></svg>`;

export const CSS = `*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html{-webkit-text-size-adjust:100%}body{margin:0;font-family:Cairo,system-ui,Tahoma,sans-serif;background:#f5f6fa;color:#1b2333;font-size:15px;line-height:1.5}
a{color:inherit}h2{font-size:17px;margin:0 0 12px;font-weight:800}h3{font-size:15px;margin:0 0 8px}
.top{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #eceef5;display:flex;align-items:center;gap:10px;padding:12px 14px}
.top .ttl{flex:1;font-weight:800;font-size:17px;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq{height:50px;min-width:50px;border-radius:14px;border:1px solid #eceef5;background:#fff;display:inline-flex;align-items:center;justify-content:center;gap:6px;color:#1b2333;cursor:pointer;padding:0 12px;box-shadow:0 1px 2px rgba(20,30,60,.04);text-decoration:none;font:inherit}
.sq svg{display:block}.top form{margin:0}
#dr{position:fixed;inset-block:0;inset-inline-start:0;width:min(84vw,340px);background:#fff;z-index:50;transition:transform .22s ease;overflow-y:auto;box-shadow:0 0 30px rgba(10,20,50,.2);padding-bottom:30px}
[dir=rtl] #dr{transform:translateX(105%)}[dir=ltr] #dr{transform:translateX(-105%)}.open #dr{transform:none!important}#ov{position:fixed;inset:0;background:rgba(15,20,40,.45);z-index:40;display:none}.open #ov{display:block}
.dh{display:flex;align-items:center;gap:14px;padding:22px 18px 16px;border-bottom:1px solid #eceef5;position:sticky;top:0;background:#fff;z-index:2}
.dh img{width:58px;height:58px;border-radius:16px;background:#000;object-fit:cover}.dh b{display:block;font-size:20px;font-weight:900}.dh small{color:#6b7488;font-size:15px}
.gt{padding:18px 20px 6px;color:#8a93a6;font-weight:800;font-size:14px}
.ni{display:flex;align-items:center;gap:14px;padding:9px 18px;text-decoration:none;font-weight:700;font-size:16px;border-radius:14px;margin:2px 8px}
.ni.on{background:#f1f3fb}.ni:active{background:#f1f3fb}.ni i{margin-inline-start:auto;font-style:normal;background:#e53935;color:#fff;border-radius:12px;padding:0 8px;font-size:12px;font-weight:800}
.tl{display:inline-grid;place-items:center;border-radius:16px;flex:none}
.wrap{padding:16px 14px 80px;max-width:1100px;margin:0 auto}
@media(min-width:1000px){#dr{transform:none!important;box-shadow:none;border-inline-end:1px solid #eceef5;width:320px}#ov,.mb{display:none!important}body{padding-inline-start:320px}}
.cards{display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:18px}@media(min-width:560px){.cards{grid-template-columns:repeat(3,1fr)}}
.card,.box{background:#fff;border:1px solid #eceef5;border-radius:20px;padding:18px;box-shadow:0 1px 3px rgba(20,30,60,.04)}
.box{margin-bottom:16px}.card{display:flex;flex-direction:column;gap:6px;align-items:flex-start}.card b{font-size:34px;font-weight:900;line-height:1.1}.card small{color:#6b7488;font-size:15px}
.mini{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px}@media(min-width:700px){.mini{grid-template-columns:repeat(4,1fr)}}
.mini div{background:#fff;border:1px solid #eceef5;border-radius:16px;padding:12px 14px}.mini b{display:block;font-size:22px}.mini small{color:#6b7488}
.ql{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #eceef5;border-radius:20px;padding:14px 16px;margin-bottom:12px;text-decoration:none;color:#1e3a9e;font-weight:800;font-size:18px}
.ql span:last-child{flex:1}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row>.grow{flex:1;min-width:140px}
input[type=text],input[type=number],input[type=password],input[type=search],select,textarea{padding:11px 12px;border:1.5px solid #dfe3ee;border-radius:12px;font:inherit;background:#fff;color:inherit;max-width:100%}
textarea{width:100%;min-height:76px}input[type=text].w,input[type=number].w{width:100%}
label.f{display:block;font-weight:700;font-size:13px;color:#4b5568;margin:0 0 4px}.fg{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:10px}
button,.btn{font:inherit;font-weight:700;border:0;border-radius:12px;padding:10px 16px;cursor:pointer;background:#1b2333;color:#fff;text-decoration:none;display:inline-block}
button.g,.btn.g{background:#eef0f6;color:#1b2333}button.r{background:#d32f2f}button.y{background:#f5b301;color:#1b2333}button.b{background:#2f5bea}button.s{padding:7px 12px;font-size:13px}
.msg{background:#e8f5e9;border:1px solid #a5d6a7;color:#1b5e20;border-radius:14px;padding:12px 14px;margin-bottom:14px;font-weight:700;white-space:pre-wrap}
.err{background:#fde8e8;border:1px solid #e57373;color:#b71c1c;border-radius:12px;padding:12px;margin-bottom:14px}
.chip{display:inline-block;padding:3px 11px;border-radius:12px;font-size:12px;font-weight:800;background:#eceff4;color:#3b4557}
.chip.new,.chip.pending,.chip.proof_sent,.chip.awaiting_payment{background:#fff3cd;color:#7a5b00}.chip.processing,.chip.under_review,.chip.verifying{background:#dfeafc;color:#1c4aa6}
.chip.done,.chip.credited,.chip.approved,.chip.ok{background:#e0f5e6;color:#1b6b3a}.chip.cancelled,.chip.rejected,.chip.expired,.chip.reversed,.chip.bad,.chip.amount_mismatch{background:#fde8e8;color:#b71c1c}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.tabs a{padding:8px 14px;background:#fff;border:1px solid #e3e6f0;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px}.tabs a.on{background:#1b2333;color:#fff;border-color:#1b2333}
.tabs i{font-style:normal;background:#e53935;color:#fff;border-radius:10px;padding:0 7px;margin-inline-start:6px;font-size:12px}
.item{border:1px solid #eceef5;border-radius:18px;padding:14px;margin-bottom:12px;background:#fff}.item .hd{display:flex;gap:12px;align-items:flex-start}.item .hd>div{flex:1;min-width:0}
.item .th{width:64px;height:64px;border-radius:14px;object-fit:cover;background:#eef0f6;flex:none}
.sm{color:#6b7488;font-size:13px}.mono{font-family:ui-monospace,Menlo,monospace;direction:ltr;unicode-bidi:embed;word-break:break-all}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.acts form{margin:0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:start;padding:9px 8px;border-bottom:1px solid #eef0f6;vertical-align:top}th{color:#6b7488;font-weight:700;white-space:nowrap}.scroll{overflow-x:auto}
.rc{max-width:100%;width:260px;max-height:300px;object-fit:contain;border-radius:14px;border:1px solid #e3e6f0;background:#fafbfe}
details summary{cursor:pointer;color:#2f5bea;font-weight:700;font-size:13px;margin-top:6px}
.pg{display:flex;gap:6px;margin-top:14px;flex-wrap:wrap}.pg a{padding:7px 13px;background:#fff;border:1px solid #e3e6f0;border-radius:10px;text-decoration:none}.pg a.on{background:#1b2333;color:#fff}
.av{width:44px;height:44px;border-radius:50%;background:#1b2333;color:#fff;display:inline-grid;place-items:center;font-weight:800;overflow:hidden;flex:none}.av img{width:100%;height:100%;object-fit:cover}
.chat{display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;margin-bottom:12px}.bub{padding:8px 12px;border-radius:14px;max-width:82%;white-space:pre-wrap;word-break:break-word}.bub.u{background:#eef0f6;align-self:flex-start}.bub.a{background:#1b2333;color:#fff;align-self:flex-end}
.login{max-width:380px;margin:12vh auto;background:#fff;padding:26px;border-radius:22px;border:1px solid #eceef5}.login label{display:block;font-weight:700;margin:12px 0 6px}.login input{width:100%}
.hint{color:#6b7488;font-size:13px;margin:0 0 12px}.sep{border:0;border-top:1px solid #eef0f6;margin:12px 0}
.bars{display:flex;align-items:flex-end;gap:5px;height:110px}.bars div{flex:1;background:#f5b301;border-radius:6px 6px 0 0;min-height:3px;position:relative}.bars span{position:absolute;top:-18px;left:0;right:0;text-align:center;font-size:11px}.lbl{display:flex;gap:5px;font-size:10px;color:#6b7488}.lbl span{flex:1;text-align:center}`;

export function layout(ctx: Ctx, title: string, body: string, badges: Record<string, number>, extraJs = ""): string {
  const { t, csrf, lang, tab } = ctx;
  const nav = NAV.map((g) => `${g.title ? `<div class="gt">${h(t(g.title))}</div>` : ""}${g.items.map(([k, i, l]) => `<a class="ni${k === tab ? " on" : ""}" href="/admin?tab=${k}">${tile(TAB_ICON[k][1], i, 52)}<span>${h(t(l))}</span>${badges[k] ? `<i>${badges[k]}</i>` : ""}</a>`).join("")}`).join("");
  const other = lang === "ar" ? "en" : "ar";
  return `<div id="ov" onclick="document.body.classList.remove('open')"></div>
<aside id="dr"><a class="dh" href="/admin" style="text-decoration:none;color:inherit"><img src="${WEB_ORIGIN}/img/logo-192.png" alt=""><div><b>HD Market</b><small>${h(t("لوحة الإدارة"))}</small></div></a>
<a class="ni${tab === "home" ? " on" : ""}" href="/admin" style="margin-top:8px">${tile(4, "chart", 52)}<span>${h(t("الرئيسية"))}</span></a>${nav}</aside>
<header class="top"><button class="sq mb" type="button" aria-label="menu" onclick="document.body.classList.add('open')">${ic("menu", 24)}</button><div class="ttl">${h(title)}</div>
<form method="post" action="/admin"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="do" value="logout"><button class="sq" aria-label="logout">${ic("out", 22)}</button></form></header>
<div class="wrap">BODY</div>${extraJs}`.replace("BODY", () => body);
}

export const fmtT = (t: any) => {
  const n = num(t); if (!n) return "—";
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(n * 1000));
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
};
export const money = (n: any, d = 4) => { const v = Number(n ?? 0); const s = v.toFixed(d).replace(/0+$/, "").replace(/\.$/, ""); return s === "" ? "0" : s; };
export const usdtFmt = (n: any) => { const v = Number(n ?? 0); const s = v.toFixed(6).replace(/0+$/, ""); const dec = s.split(".")[1] ?? ""; return dec.length < 2 ? v.toFixed(2) : s; };

export const PICK_JS = `<script>document.addEventListener("change",function(e){var i=e.target;if(!i.classList||!i.classList.contains("pick")||!i.files[0])return;var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var m=700,k=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);var d=c.toDataURL("image/jpeg",0.8);i.parentNode.querySelector("input[name=image]").value=d;var pv=i.parentNode.querySelector("img.th");if(pv){pv.src=d;pv.style.visibility="visible"}};im.src=r.result};r.readAsDataURL(i.files[0])});document.addEventListener("click",function(e){var b=e.target;if(b.dataset&&b.dataset.copy){navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy);b.textContent="✓"}})</script>`;
export const LIVE_JS = `<script>(function(){function near(el){return el.scrollHeight-el.scrollTop-el.clientHeight<80}setInterval(async function(){if(document.hidden)return;try{var r=await fetch(location.href,{credentials:"same-origin"});if(!r.ok)return;var d=new DOMParser().parseFromString(await r.text(),"text/html");var a=document.getElementById("thr"),b=d.getElementById("thr");if(a&&b&&a.innerHTML!==b.innerHTML)a.innerHTML=b.innerHTML;var c=document.getElementById("chat"),e=d.getElementById("chat");if(c&&e&&c.innerHTML!==e.innerHTML){var s=near(c);c.innerHTML=e.innerHTML;if(s)c.scrollTop=c.scrollHeight}}catch(x){}},5000);var c=document.getElementById("chat");if(c)c.scrollTop=c.scrollHeight})()</script>`;
export const picker = (cur: any) => `<span class="row"><img class="th" ${cur ? `src="${h(cur)}"` : 'style="visibility:hidden"'} alt=""><input type="hidden" name="image" value=""><input class="pick" type="file" accept="image/*"></span>`;
export const field = (label: string, inner: string) => `<div><label class="f">${h(label)}</label>${inner}</div>`;
export const statusChip = (st: string, label: string) => `<span class="chip ${h(st)}">${h(label)}</span>`;
