// Admin panel entry: login, session, CSRF, language, flash messages, routing.
import { run, num, now, rnd, h, sha, hmac, safeEq, env, SECRET, ADMIN_EMAIL, ADMIN_USER, ADMIN_PASSWORD, nowS } from "./core";
import { adminAct } from "./panel_act";
import { renderPage, navBadges } from "./panel_pages";
import { CSS, layout, mkT, Ctx, TAB_LABEL } from "./panel_ui";
import { WEB_ORIGIN } from "./shop";

const cookieOf = (req: Request, n: string) => (req.headers.get("cookie") ?? "").split(/;\s*/).map((c) => c.split("=")).find((c) => c[0] === n)?.slice(1).join("=");
const sessionCookie = (v: string, maxAge: number) => `hdadmin=${v}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const smallCookie = (n: string, v: string, maxAge: number, httpOnly = true) => `${n}=${v}; Path=/admin; ${httpOnly ? "HttpOnly; " : ""}Secure; SameSite=Lax; Max-Age=${maxAge}`;
function sessionValid(req: Request) {
  const v = cookieOf(req, "hdadmin");
  if (!v) return null;
  const [exp, nonce, sig] = v.split(".");
  if (!exp || !nonce || !sig || Number(exp) < now() || !safeEq(sig, hmac(SECRET, `${exp}.${nonce}`))) return null;
  return nonce;
}
const csrfOf = (nonce: string) => hmac(SECRET, "csrf:" + nonce);
const fails = new Map<string, { n: number; until: number }>();

const page = (lang: "ar" | "en", title: string, body: string, js = "", headers: Record<string, string> = {}) =>
  new Response(`<!DOCTYPE html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#ffffff"><title>${h(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>${body}${js}</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; connect-src 'self'; img-src data: https:; font-src https://fonts.gstatic.com; style-src 'unsafe-inline' https://fonts.googleapis.com; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'`, ...headers },
  });
const redirect = (to: string, headers: string[] = []) => { const hd = new Headers({ Location: to }); for (const c of headers) hd.append("Set-Cookie", c); return new Response(null, { status: 303, headers: hd }); };

const loginForm = (lang: "ar" | "en", err: string) => {
  const t = mkT(lang);
  return `<form class="login" method="post"><div style="text-align:center"><img src="${WEB_ORIGIN}/img/logo-192.png" width="72" height="72" style="border-radius:20px" alt=""></div><h2 style="text-align:center;margin-top:10px">HD Market · ${h(t("لوحة الإدارة"))}</h2>${err ? `<div class="err">${h(err)}</div>` : ""}<input type="hidden" name="do" value="login"><label>${h(t("اسم المدير"))}</label><input type="text" name="u" autocomplete="username" required><label>${h(t("كلمة المرور"))}</label><input type="password" name="p" autocomplete="current-password" required><p><button style="width:100%;padding:13px">${h(t("دخول"))}</button></p></form>`;
};

export async function admin(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let lang: "ar" | "en" = cookieOf(req, "hdlang") === "en" ? "en" : "ar";
  const t = mkT(lang);
  if (!SECRET || !ADMIN_USER || ADMIN_PASSWORD.length < 8) return page(lang, "Admin", `<div class="login"><h2>لوحة التحكم غير مفعّلة</h2><p>اضبط المتغيرات <code>APP_SECRET</code> و<code>ADMIN_USER</code> و<code>ADMIN_PASSWORD</code> (8 أحرف على الأقل) في Railway.</p></div>`);
  const ql = url.searchParams.get("lang");
  if (ql === "ar" || ql === "en") { url.searchParams.delete("lang"); return redirect(url.pathname + url.search, [smallCookie("hdlang", ql, 31536000, false)]); }
  const post = req.method === "POST";
  const form = post ? await req.formData() : new FormData();
  const f = (k: string) => String(form.get(k) ?? "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "x";

  if (post && f("do") === "login") {
    const st = fails.get(ip) ?? { n: 0, until: 0 };
    if (st.n >= 5 && now() < st.until) return page(lang, "Login", loginForm(lang, t("محاولات كثيرة. انتظر دقيقة.")));
    const good = (safeEq(sha(ADMIN_USER), sha(f("u"))) || safeEq(sha(ADMIN_EMAIL), sha(f("u").trim().toLowerCase()))) && safeEq(sha(ADMIN_PASSWORD), sha(f("p")));
    if (!good) { await Bun.sleep(1000); fails.set(ip, { n: st.n + 1, until: now() + 60 }); return page(lang, "Login", loginForm(lang, t("بيانات الدخول غير صحيحة."))); }
    fails.delete(ip);
    const exp = now() + 30 * 86400, nonce = rnd(12);
    return redirect("/admin", [sessionCookie(`${exp}.${nonce}.${hmac(SECRET, `${exp}.${nonce}`)}`, 30 * 86400)]);
  }
  const nonce = sessionValid(req);
  if (!nonce) return page(lang, "Login", loginForm(lang, ""));
  const csrf = csrfOf(nonce);

  if (post) {
    if (!safeEq(csrf, f("csrf"))) return new Response("CSRF", { status: 403 });
    const act = f("do");
    if (act === "logout") return redirect("/admin", [sessionCookie("", 0)]);
    const vis: Record<string, string> = {}; for (const [k, v] of form.entries()) if (typeof v === "string") vis[k] = v;
    let flash = "";
    try { flash = await adminAct(act, f, vis); } catch (e) { console.error(e); flash = "حدث خطأ غير متوقع أثناء تنفيذ الأمر"; }
    return redirect(url.pathname + url.search, flash ? [smallCookie("hdflash", encodeURIComponent(flash), 60)] : []);
  }

  const tab = url.searchParams.get("tab") ?? "home";
  const flashRaw = cookieOf(req, "hdflash"); let flash = "";
  try { flash = flashRaw ? decodeURIComponent(flashRaw) : ""; } catch {}
  const F = (act: string, inner: string, extra = "") => `<form method="post" action="/admin?tab=${tab}${extra}"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="do" value="${act}">${inner}</form>`;
  const hid = (n: string, v: any) => `<input type="hidden" name="${n}" value="${h(v)}">`;
  const ctx: Ctx = { csrf, lang, url, tab, t, F, hid };
  let pg;
  try { pg = await renderPage(tab, ctx); } catch (e) { console.error(e); pg = { title: t("خطأ"), body: `<div class="err">${h(t("تعذّر عرض الصفحة. حاول مرة أخرى."))}</div>` }; }
  const body = (flash ? `<div class="msg">${h(t(flash))}</div>` : "") + pg.body;
  return page(lang, `HD Market · ${pg.title}`, layout(ctx, pg.title, body, await navBadges()), pg.js ?? "", flashRaw ? { "Set-Cookie": smallCookie("hdflash", "", 0) } : {});
}
