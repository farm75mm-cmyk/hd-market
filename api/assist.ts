// Smart assistant: admin-managed guided flow + FAQ + grounded product search (+ optional LLM).
// The assistant NEVER invents products, prices or stock: everything it shows comes from the database.
import { run, first, count, num, nowS, serial, env, Fail, ok, Row, h, getSet, putSet, authUser } from "./core";
import { IMG, imgUrl, optPrice } from "./shop";
import { statusChip, type Ctx } from "./panel_ui";

type Lang = "ar" | "en";
type Vars = { scope?: string; level?: number; budget?: number; q?: string };
type Item = { kind: string; id: number; name: string; descr: string; price: number; level: number; stock: number; go: string; image: string | null };
type Opt = { id: number; label: string; icon: string };
type Out = { messages: string[]; options: Opt[]; input: { key: string; node: number } | null; results: Item[]; support: boolean; vars: Vars };

const SCOPES = ["farm", "tool", "code", "box", "opt"];
const SCOPE_AR: Record<string, string> = { farm: "المزارع", tool: "الأدوات والمنتجات", code: "أكواد الاشتراك", box: "الصناديق العشوائية", opt: "منتجات اختياري" };
const SCOPE_EN: Record<string, string> = { farm: "Farms", tool: "Tools & products", code: "Subscription codes", box: "Random boxes", opt: "Optional products" };
const ACTIONS: [string, string][] = [["none", "عرض نص / أسئلة فقط"], ["search", "البحث في المنتجات وعرض النتائج"], ["prices", "عرض ملخص الأسعار"], ["pay", "عرض طرق الدفع"], ["orders", "عرض آخر طلبات المستخدم"], ["support", "التحويل إلى الدعم"], ["free", "فتح مربع الكتابة (سؤال آخر)"], ["answer", "عرض إجابة نصية فقط"]];
const SET_KEYS: [string, string][] = [["", "لا شيء"], ["scope", "نوع المنتج (farm / tool / code / box / opt)"], ["level", "المستوى (رقم)"], ["budget", "الميزانية (رقم USDT)"], ["q", "كلمة بحث"]];
const INPUT_KEYS: [string, string][] = [["", "بدون"], ["level", "رقم المستوى"], ["budget", "رقم الميزانية"], ["q", "نص بحث"]];

const DEF = {
  welcome_ar: "مرحبًا بك في المساعد الذكي لـ HD Market، كيف يمكنني مساعدتك؟",
  welcome_en: "Welcome to the HD Market smart assistant. How can I help you?",
  fb_ar: "عذرًا، لم أجد معلومات كافية عن طلبك. يمكنك التواصل مع الدعم لمساعدتك.",
  fb_en: "Sorry, I couldn't find enough information about your request. You can contact support for help.",
  instr: "أنت مساعد متجر HD Market (لعبة Hay Day). أجب باختصار وبلطف وبنفس لغة المستخدم. استخدم فقط المعلومات الموجودة في قسم DATA. لا تخترع منتجات أو أسعارًا أو مخزونًا أو سياسات.",
};

// ---------- schema ----------
await run(`CREATE TABLE IF NOT EXISTS ai_options (id ${serial}, parent_id BIGINT NOT NULL DEFAULT 0, label_ar TEXT NOT NULL, label_en TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', sort INT NOT NULL DEFAULT 0,
  active INT NOT NULL DEFAULT 1, text_ar TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT 'none', set_key TEXT NOT NULL DEFAULT '', set_val TEXT NOT NULL DEFAULT '',
  input_key TEXT NOT NULL DEFAULT '', next_id BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS ai_faq (id ${serial}, q_ar TEXT NOT NULL, q_en TEXT NOT NULL DEFAULT '', a_ar TEXT NOT NULL, a_en TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '', sort INT NOT NULL DEFAULT 0, active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS ai_blocked (kind TEXT NOT NULL, ref BIGINT NOT NULL, PRIMARY KEY (kind, ref))`);
await run(`CREATE TABLE IF NOT EXISTS ai_chats (id ${serial}, user_id BIGINT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, miss INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);
await run(`CREATE INDEX IF NOT EXISTS ai_chats_u ON ai_chats (user_id, id)`);

async function mk(o: Partial<Row> & { label_ar: string }): Promise<number> {
  const r = await run(`INSERT INTO ai_options (parent_id, label_ar, label_en, icon, sort, active, text_ar, text_en, action, set_key, set_val, input_key, next_id, created_at) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [o.parent_id ?? 0, o.label_ar, o.label_en ?? "", o.icon ?? "", o.sort ?? 0, o.text_ar ?? "", o.text_en ?? "", o.action ?? "none", o.set_key ?? "", o.set_val ?? "", o.input_key ?? "", o.next_id ?? 0, nowS()]);
  return num(r[0]?.id);
}
export async function seedFlow() {
  const results = await mk({ parent_id: -1, label_ar: "نتائج البحث", label_en: "Search results", action: "search", text_ar: "هذه المنتجات المطابقة لطلبك:", text_en: "These products match your request:" });
  const budget = await mk({ parent_id: -1, label_ar: "سؤال الميزانية", label_en: "Budget question", text_ar: "ما ميزانيتك؟ (بالـ USDT)", text_en: "What is your budget? (USDT)", input_key: "budget", next_id: results });
  const bud = [5, 10, 20, 50, 100];
  for (let i = 0; i < bud.length; i++) await mk({ parent_id: budget, label_ar: `حتى ${bud[i]} USDT`, label_en: `Up to ${bud[i]} USDT`, icon: "💵", sort: i, set_key: "budget", set_val: String(bud[i]), next_id: results });
  await mk({ parent_id: budget, label_ar: "بدون حد", label_en: "No limit", icon: "♾️", sort: 9, set_key: "budget", set_val: "0", next_id: results });
  // farm
  const farm = await mk({ label_ar: "شراء مزرعة Hay Day", label_en: "Buy a Hay Day farm", icon: "🏡", sort: 1, set_key: "scope", set_val: "farm", text_ar: "ما المستوى الذي تبحث عنه؟", text_en: "Which level are you looking for?", input_key: "level", next_id: budget });
  for (const [i, l] of [50, 100, 120, 130].entries()) await mk({ parent_id: farm, label_ar: `Level ${l}`, label_en: `Level ${l}`, icon: "⭐", sort: i, set_key: "level", set_val: String(l), next_id: budget });
  await mk({ parent_id: farm, label_ar: "مستوى آخر", label_en: "Another level", icon: "✏️", sort: 9, text_ar: "اكتب المستوى الذي تريده (رقم فقط)", text_en: "Type the level you want (number only)", input_key: "level", next_id: budget });
  // products
  const prod = await mk({ label_ar: "شراء منتجات", label_en: "Buy products", icon: "📦", sort: 2, text_ar: "ماذا تريد أن تشتري؟", text_en: "What would you like to buy?" });
  for (const [i, [k, ar, en, ic]] of ([["tool", "أدوات ومنتجات", "Tools & products", "🛠️"], ["code", "أكواد اشتراك", "Subscription codes", "🔑"], ["box", "صناديق عشوائية", "Random boxes", "🎁"], ["opt", "منتجات اختياري", "Optional products", "🌾"]] as const).entries())
    await mk({ parent_id: prod, label_ar: ar, label_en: en, icon: ic, sort: i, set_key: "scope", set_val: k, next_id: budget });
  await mk({ label_ar: "معرفة الأسعار", label_en: "Prices", icon: "💰", sort: 3, action: "prices" });
  await mk({ label_ar: "طرق الدفع", label_en: "Payment methods", icon: "💳", sort: 4, action: "pay" });
  await mk({ label_ar: "متابعة الطلب", label_en: "Track my order", icon: "🚚", sort: 5, action: "orders" });
  await mk({ label_ar: "التواصل مع الدعم", label_en: "Contact support", icon: "🎧", sort: 6, action: "support", text_ar: "يسعدنا مساعدتك! تواصل مع فريق الدعم من الزر أدناه.", text_en: "We're happy to help! Contact the support team with the button below." });
  await mk({ label_ar: "سؤال آخر", label_en: "Another question", icon: "❓", sort: 7, action: "free", text_ar: "اكتب سؤالك في المربع أدناه وسأبحث في بيانات المتجر.", text_en: "Type your question below and I'll search the store data." });
}
if ((await count(`SELECT COUNT(*) c FROM ai_options`)) === 0) await seedFlow();

// ---------- helpers ----------
const lgOf = (b: Row): Lang => (b.lang === "ar" ? "ar" : "en");
const tx = (r: Row, base: string, lg: Lang) => String((lg === "en" ? r[base + "_en"] : "") || r[base + "_ar"] || "");
const norm = (s: string) => String(s ?? "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).trim();
const words = (s: string) => norm(s).split(/[^a-z0-9؀-ۿ.]+/).map((w) => (w.length > 4 && w.startsWith("ال") ? w.slice(2) : w)).filter((w) => w.length >= 2);
const STOP = new Set(("احتاج بدي عايز ابحث اطلب بسعر بميزانيه بحدود حوالي تقريبا اريد ابغي ابي ابغى شراء اشتري اشتر عندكم عندك هل يوجد لو سمحت من في على عن الى الي ما هو هي ل ب مع انا لي لدي ممكن اعطني ارني وريني كم سعر اسعار " +
  "i want to buy a an the do you have is there any please me for with of in on show give need looking look price prices how much what which").split(/\s+/));
const fallbackText = async (lg: Lang) => (lg === "en" ? (await getSet("ai_fb_en")) || DEF.fb_en : (await getSet("ai_fb_ar")) || DEF.fb_ar);
const num2 = (v: any, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
function cleanVars(v: any): Vars {
  const o: Vars = {};
  if (v && typeof v === "object") {
    if (SCOPES.includes(v.scope)) o.scope = v.scope;
    if (num2(v.level, 999) > 0) o.level = Math.floor(num2(v.level, 999));
    if (num2(v.budget, 1e6) > 0) o.budget = num2(v.budget, 1e6);
    if (typeof v.q === "string" && v.q.trim()) o.q = v.q.trim().slice(0, 60);
  }
  return o;
}
function setVar(V: Vars, key: string, val: any) {
  if (key === "scope") { if (SCOPES.includes(String(val))) V.scope = String(val); }
  else if (key === "level") { const n = Math.floor(num2(val, 999)); if (n > 0) V.level = n; else delete V.level; }
  else if (key === "budget") { const n = num2(val, 1e6); if (n > 0) V.budget = n; else delete V.budget; }
  else if (key === "q") { const q = String(val ?? "").trim().slice(0, 60); if (q) V.q = q; else delete V.q; }
}
const blank = (V: Vars): Out => ({ messages: [], options: [], input: null, results: [], support: false, vars: V });
const merge = (a: Out, b: Out): Out => ({ messages: [...a.messages, ...b.messages], options: b.options, input: b.input, results: b.results, support: a.support || b.support, vars: b.vars });
async function allowedScopes(): Promise<string[]> {
  const s = await getSet("ai_scopes", SCOPES.join(","));
  return s.split(",").map((x) => x.trim()).filter((x) => SCOPES.includes(x));
}

// ---------- catalog (only real data) ----------
async function catalog(scopes: string[]): Promise<Item[]> {
  const blocked = new Set((await run(`SELECT kind, ref FROM ai_blocked`)).map((r) => r.kind + ":" + num(r.ref)));
  const out: Item[] = [];
  if (scopes.includes("farm"))
    for (const f of await run(`SELECT id, name, descr, level, price, ${IMG()} FROM farms WHERE active = 1 AND sold = 0`))
      out.push({ kind: "farm", id: num(f.id), name: f.name, descr: f.descr ?? "", price: num(f.price), level: num(f.level), stock: 1, go: "farms", image: imgUrl("f", f) });
  if (scopes.includes("tool"))
    for (const p of await run(`SELECT id, category_id, name, price, qty, descr, ${IMG()} FROM products WHERE active = 1 AND kind = 'tool'`))
      out.push({ kind: "tool", id: num(p.id), name: p.name, descr: p.descr ?? "", price: num(p.price), level: 0, stock: num(p.qty), go: "cat:" + num(p.category_id), image: imgUrl("p", p) });
  if (scopes.includes("code"))
    for (const p of await run(`SELECT p.id, p.name, p.price, p.descr, ${IMG("image", "p.")}, (SELECT COUNT(*) FROM sub_codes s WHERE s.product_id = p.id AND s.status = 'available') n FROM products p WHERE p.active = 1 AND p.kind = 'code'`))
      out.push({ kind: "code", id: num(p.id), name: p.name, descr: p.descr ?? "", price: num(p.price), level: 0, stock: num(p.n), go: "codes", image: imgUrl("p", p) });
  if (scopes.includes("box"))
    for (const b of await run(`SELECT id, name, descr, price, ${IMG()} FROM random_boxes WHERE active = 1`))
      out.push({ kind: "box", id: num(b.id), name: b.name, descr: b.descr ?? "", price: num(b.price), level: 0, stock: -1, go: "boxes", image: imgUrl("b", b) });
  if (scopes.includes("opt")) {
    const dp = await optPrice();
    for (const o of await run(`SELECT id, name, level, building, price FROM opt_items WHERE active = 1`))
      out.push({ kind: "opt", id: num(o.id), name: o.name, descr: o.building ?? "", price: o.price == null ? dp : num(o.price), level: num(o.level), stock: -1, go: "opt", image: null });
  }
  return out.filter((i) => !blocked.has(i.kind + ":" + i.id));
}
function matchItems(items: Item[], V: Vars): Item[] {
  const toks = words(V.q ?? "").filter((w) => !STOP.has(w));
  let r = items.filter((i) => i.stock !== 0);
  if (V.level) r = r.filter((i) => (i.kind === "farm" ? i.level === V.level : i.kind === "opt" ? i.level <= V.level! : true));
  if (V.budget) r = r.filter((i) => i.price <= V.budget!);
  if (toks.length) {
    const need = Math.max(1, Math.ceil(toks.length * 0.6));
    const sc = (i: Item) => { const hay = norm(i.name + " " + i.descr); return toks.filter((w) => hay.includes(w)).length; };
    r = r.filter((i) => sc(i) >= need);
  }
  return r.sort((a, b) => a.price - b.price).slice(0, 8);
}
const fmtP = (n: number) => String(Math.round(n * 10000) / 10000);

// ---------- actions ----------
async function kids(parent: number, lg: Lang): Promise<Opt[]> {
  return (await run(`SELECT id, label_ar, label_en, icon FROM ai_options WHERE parent_id = $1 AND active = 1 ORDER BY sort, id`, [parent])).map((r) => ({ id: num(r.id), label: tx(r, "label", lg), icon: r.icon ?? "" }));
}
async function doSearch(V: Vars, lg: Lang, head: string): Promise<Out> {
  const o = blank(V), allowed = await allowedScopes();
  const sc = V.scope ? allowed.filter((s) => s === V.scope) : allowed;
  const res = sc.length ? matchItems(await catalog(sc), V) : [];
  if (res.length) { o.messages.push(head || (lg === "en" ? "These products match your request:" : "هذه المنتجات المطابقة لطلبك:")); o.results = res; }
  else { o.messages.push(await fallbackText(lg)); o.support = true; }
  return o;
}
async function doPrices(lg: Lang, head: string): Promise<Out> {
  const o = blank({}), items = await catalog(await allowedScopes()), lines: string[] = [];
  for (const s of SCOPES) {
    const l = items.filter((i) => i.kind === s && i.stock !== 0);
    if (!l.length) continue;
    const ps = l.map((i) => i.price), a = Math.min(...ps), b = Math.max(...ps);
    lines.push(`• ${(lg === "en" ? SCOPE_EN : SCOPE_AR)[s]}: ${l.length} ${lg === "en" ? "available" : "متاح"} — ${a === b ? fmtP(a) : fmtP(a) + " – " + fmtP(b)} USDT`);
  }
  if (!lines.length) { o.messages.push(await fallbackText(lg)); o.support = true; return o; }
  o.messages.push([head || (lg === "en" ? "Current prices (USDT):" : "الأسعار الحالية (بالـ USDT):"), ...lines].join("\n"));
  return o;
}
async function doPay(lg: Lang, head: string): Promise<Out> {
  const o = blank({}), ms = await run(`SELECT name, currency FROM payment_methods WHERE active = 1 ORDER BY id`);
  if (!ms.length) { o.messages.push(await fallbackText(lg)); o.support = true; return o; }
  o.messages.push([head || (lg === "en" ? "You pay from your wallet balance. Top up using one of these methods:" : "الدفع يتم من رصيد محفظتك. يمكنك شحن الرصيد بإحدى هذه الطرق:"), ...ms.map((m) => `• ${m.name} (${m.currency})`)].join("\n"));
  return o;
}
const ORD_EN: Record<string, string> = { new: "New", processing: "Processing", done: "Completed", cancelled: "Cancelled" };
const ORD_AR: Record<string, string> = { new: "جديد", processing: "قيد التنفيذ", done: "مكتمل", cancelled: "ملغي" };
async function doOrders(uid: number, lg: Lang, head: string): Promise<Out> {
  const o = blank({}), rs = await run(`SELECT id, product_name, status FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 5`, [uid]);
  if (!rs.length) { o.messages.push(lg === "en" ? "You have no orders yet." : "لا توجد لديك طلبات بعد."); return o; }
  o.messages.push([head || (lg === "en" ? "Your latest orders:" : "آخر طلباتك:"), ...rs.map((r) => `• #${num(r.id)} ${r.product_name} — ${(lg === "en" ? ORD_EN : ORD_AR)[r.status] ?? r.status}`)].join("\n"));
  return o;
}
async function nodeById(id: number) { return id > 0 ? await first(`SELECT * FROM ai_options WHERE id = $1 AND active = 1`, [id]) : undefined; }

async function enter(n: Row, V: Vars, lg: Lang, uid: number, depth = 0): Promise<Out> {
  const text = tx(n, "text", lg);
  switch (n.action) {
    case "search": return doSearch(V, lg, text);
    case "prices": return doPrices(lg, text);
    case "pay": return doPay(lg, text);
    case "orders": return doOrders(uid, lg, text);
    case "support": { const o = blank(V); o.messages.push(text || (lg === "en" ? "You can contact our support team." : "يمكنك التواصل مع فريق الدعم.")); o.support = true; return o; }
    case "free": { const o = blank(V); o.messages.push(text || (lg === "en" ? "Type your question below." : "اكتب سؤالك في المربع أدناه.")); o.input = { key: "q", node: num(n.id) }; return o; }
    case "answer": { const o = blank(V); if (text) o.messages.push(text); return o; }
  }
  const o = blank(V);
  if (text) o.messages.push(text);
  o.options = await kids(num(n.id), lg);
  if (n.input_key) o.input = { key: n.input_key, node: num(n.id) };
  if (!text && !o.options.length && !n.input_key && num(n.next_id) > 0 && depth < 6) {
    const nx = await nodeById(num(n.next_id));
    if (nx) return merge(o, await enter(nx, V, lg, uid, depth + 1));
  }
  return o;
}

// ---------- free text ----------
function extract(text: string): Vars & { scope?: string } {
  const n = norm(text), V: Vars = {};
  let m = n.match(/(?:level|lvl|lv|لفل|ليفل|مستوي)\s*[:=]?\s*(\d{1,3})/) || n.match(/(\d{1,3})\s*(?:level|lvl|لفل|ليفل|مستوي)/);
  if (m) setVar(V, "level", m[1]);
  m = n.match(/(?:budget|under|below|max|up to|ميزانيتي|ميزانيه|اقل من|حتي|الي)\s*\$?\s*(\d+(?:\.\d+)?)/) || n.match(/(\d+(?:\.\d+)?)\s*(?:usdt|\$|دولار)/);
  if (m) setVar(V, "budget", m[1]);
  if (/مزرع|farm/.test(n)) V.scope = "farm";
  else if (/كود|اكواد|اشتراك|code|subscription/.test(n)) V.scope = "code";
  else if (/صندوق|صناديق|box/.test(n)) V.scope = "box";
  else if (/اختياري|optim/.test(n)) V.scope = "opt";
  else if (/ادوات|اداه|tool/.test(n)) V.scope = "tool";
  const rest = n.replace(/(?:level|lvl|lv|لفل|ليفل|مستوي)\s*[:=]?\s*\d{1,3}|\d{1,3}\s*(?:level|lvl|لفل|ليفل|مستوي)|(?:budget|under|below|max|up to|ميزانيتي|ميزانيه|اقل من|حتي|الي)\s*\$?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:usdt|\$|دولار)/g, " ");
  const toks = words(rest).filter((w) => !STOP.has(w) && !/^(مزرع\S*|farms?|كود\S*|اكواد|اشتراك\S*|codes?|صندوق|صناديق|boxes|box|اختياري|ادوات|اداه|tools?)$/.test(w) && !/^\d+$/.test(w));
  if (toks.length) V.q = toks.join(" ").slice(0, 60);
  return V;
}
async function faqAnswer(text: string, lg: Lang): Promise<string | null> {
  const n = norm(text), tk = new Set(words(text));
  let best: Row | null = null, bs = 0;
  for (const f of await run(`SELECT * FROM ai_faq WHERE active = 1 ORDER BY sort, id`)) {
    const kws = String(f.keywords ?? "").split(/[,،\n]/).map((k) => norm(k)).filter(Boolean);
    let s = kws.some((k) => n.includes(k)) ? 10 : 0;
    for (const q of [f.q_ar, f.q_en]) {
      const qw = words(q).filter((w) => !STOP.has(w));
      if (qw.length >= 2) { const hit = qw.filter((w) => tk.has(w)).length / qw.length; if (hit >= 0.6) s = Math.max(s, hit * 5); }
    }
    if (s > bs) { bs = s; best = f; }
  }
  return best ? tx(best, "a", lg) : null;
}
async function llmAnswer(text: string, lg: Lang): Promise<string | null> {
  const key = env("ANTHROPIC_API_KEY");
  if (!key || (await getSet("ai_llm_on", "0")) !== "1") return null;
  try {
    const items = (await catalog(await allowedScopes())).filter((i) => i.stock !== 0).sort((a, b) => a.price - b.price).slice(0, 60);
    const faqs = await run(`SELECT q_ar, a_ar, q_en, a_en FROM ai_faq WHERE active = 1 ORDER BY sort, id LIMIT 40`);
    const fb = await fallbackText(lg);
    const data = `PRODUCTS (kind | name | level | price USDT | stock):\n${items.map((i) => `${i.kind} | ${i.name} | ${i.level || "-"} | ${fmtP(i.price)} | ${i.stock < 0 ? "n/a" : i.stock}`).join("\n")}\n\nFAQ:\n${faqs.map((f) => `Q: ${lg === "en" && f.q_en ? f.q_en : f.q_ar}\nA: ${lg === "en" && f.a_en ? f.a_en : f.a_ar}`).join("\n")}\n\nINFO:\n${await getSet("ai_info")}`;
    const system = `${(await getSet("ai_instr")) || DEF.instr}\n\nRules: answer ONLY from the DATA block. Never invent products, prices, stock or order info. If the answer is not in DATA reply with exactly this sentence and nothing else: ${fb}\nReply language: ${lg === "en" ? "English" : "Arabic"}.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ model: (await getSet("ai_model")) || "claude-haiku-4-5-20251001", max_tokens: 400, system, messages: [{ role: "user", content: `DATA:\n${data}\n\nUSER QUESTION: ${text.slice(0, 500)}` }] }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const out = String(j?.content?.[0]?.text ?? "").trim();
    return out && out !== fb ? out.slice(0, 1500) : null;
  } catch { return null; }
}
async function freeText(text: string, V0: Vars, lg: Lang, uid: number): Promise<Out> {
  const f = await faqAnswer(text, lg);
  if (f) { const o = blank(V0); o.messages.push(f); return o; }
  const n = norm(text), ex = extract(text);
  if (/طلبي|طلباتي|متابعه|حاله الطلب|order status|my order|track/.test(n)) return doOrders(uid, lg, "");
  if (/طرق الدفع|طريقه الدفع|كيف ادفع|payment method|how (do i |to )?pay|شحن الرصيد|top.?up/.test(n)) return doPay(lg, "");
  if (/(^|\s)(دعم|support|موظف|human|agent)(\s|$)/.test(n)) { const o = blank(V0); o.messages.push(lg === "en" ? "You can contact our support team." : "يمكنك التواصل مع فريق الدعم."); o.support = true; return o; }
  if (/^(اسعار|الاسعار|سعر|prices?)$/.test(n)) return doPrices(lg, "");
  const V: Vars = { ...V0, ...ex };
  if (!ex.q) delete V.q;
  if (V.level || V.budget || V.scope || V.q) {
    const allowed = await allowedScopes(), sc = V.scope ? allowed.filter((s) => s === V.scope) : allowed;
    const res = sc.length ? matchItems(await catalog(sc), V) : [];
    if (res.length) { const o = blank(V); o.messages.push(lg === "en" ? "These products match your request:" : "هذه المنتجات المطابقة لطلبك:"); o.results = res; return o; }
  }
  const l = await llmAnswer(text, lg);
  if (l) { const o = blank(V0); o.messages.push(l); return o; }
  const o = blank(V0); o.messages.push(await fallbackText(lg)); o.support = true; return o;
}

// ---------- logging ----------
async function log(uid: number, role: string, text: string, miss = 0) {
  const r = await run(`INSERT INTO ai_chats (user_id, role, text, miss, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [uid, role, text.slice(0, 1500), miss, nowS()]);
  return num(r[0]?.id);
}
async function finish(uid: number, user: string, out: Out, lg: Lang) {
  const fb = await fallbackText(lg), missed = out.messages.some((m) => m === fb) ? 1 : 0;
  await log(uid, "user", user, missed);
  const bot = [...out.messages, ...out.results.map((r) => `${r.name} — ${fmtP(r.price)} USDT`)].join("\n");
  if (bot) await log(uid, "bot", bot);
  return ok({ ...out });
}
async function limit(uid: number) {
  if ((await count(`SELECT COUNT(*) c FROM ai_chats WHERE user_id = $1 AND role = 'user' AND created_at > $2`, [uid, nowS() - 3600])) >= 60) throw new Fail("too_many", 429);
}

export const AI: Record<string, (b: Row) => Promise<Response>> = {
  async ai_open(b) {
    await authUser(b);
    const lg = lgOf(b);
    if ((await getSet("ai_on", "1")) !== "1") return ok({ on: false });
    const w = lg === "en" ? (await getSet("ai_welcome_en")) || DEF.welcome_en : (await getSet("ai_welcome_ar")) || DEF.welcome_ar;
    return ok({ on: true, messages: [w], options: await kids(0, lg), input: { key: "q", node: 0 }, results: [], support: false, vars: {} });
  },
  async ai_step(b) {
    const u = await authUser(b), lg = lgOf(b);
    if ((await getSet("ai_on", "1")) !== "1") throw new Fail("off");
    await limit(num(u.id));
    const V = cleanVars(b.vars), id = Math.floor(num(b.node));
    if (id <= 0) { const o = blank({}); o.messages.push(lg === "en" ? (await getSet("ai_welcome_en")) || DEF.welcome_en : (await getSet("ai_welcome_ar")) || DEF.welcome_ar); o.options = await kids(0, lg); o.input = { key: "q", node: 0 }; return ok({ ...o }); }
    const n = await nodeById(id);
    if (!n) throw new Fail("not_found", 404);
    if (n.set_key) setVar(V, n.set_key, n.set_val);
    const out = await enter(n, V, lg, num(u.id));
    return finish(num(u.id), `${n.icon ? n.icon + " " : ""}${tx(n, "label", lg)}`, out, lg);
  },
  async ai_ask(b) {
    const u = await authUser(b), lg = lgOf(b);
    if ((await getSet("ai_on", "1")) !== "1") throw new Fail("off");
    const text = String(b.text ?? "").trim().slice(0, 300);
    if (!text) throw new Fail("invalid");
    await limit(num(u.id));
    const V = cleanVars(b.vars), n = await nodeById(Math.floor(num(b.node)));
    let out: Out;
    if (n && n.input_key && ["level", "budget"].includes(n.input_key) && /^\s*\$?\d+(\.\d+)?\s*(usdt|\$)?\s*$/i.test(text)) {
      setVar(V, n.input_key, text.replace(/[^\d.]/g, ""));
      const nx = await nodeById(num(n.next_id));
      out = nx ? await enter(nx, V, lg, num(u.id)) : await doSearch(V, lg, "");
    } else if (n && n.input_key === "q" && n.action !== "free" && num(n.id) > 0) {
      setVar(V, "q", text);
      const nx = await nodeById(num(n.next_id));
      out = nx ? await enter(nx, V, lg, num(u.id)) : await doSearch(V, lg, "");
    } else out = await freeText(text, V, lg, num(u.id));
    return finish(num(u.id), text, out, lg);
  },
};

// ---------- admin ----------
const bool = (v: string) => (v === "1" || v === "on" ? 1 : 0);
async function descendants(id: number): Promise<number[]> {
  const all = [id]; let frontier = [id];
  for (let i = 0; i < 10 && frontier.length; i++) {
    const rs = await run(`SELECT id FROM ai_options WHERE parent_id IN (${frontier.map((_, k) => "$" + (k + 1)).join(",")})`, frontier);
    frontier = rs.map((r) => num(r.id)).filter((x) => !all.includes(x)); all.push(...frontier);
  }
  return all;
}
async function resort(parent: number, id: number, dir: number) {
  const ids = (await run(`SELECT id FROM ai_options WHERE parent_id = $1 ORDER BY sort, id`, [parent])).map((r) => num(r.id));
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (let k = 0; k < ids.length; k++) await run(`UPDATE ai_options SET sort = $1 WHERE id = $2`, [k * 10, ids[k]]);
}
export async function assistAct(act: string, f: (k: string) => string, id: number): Promise<string> {
  switch (act) {
    case "ai_set": {
      await putSet("ai_on", bool(f("ai_on")) ? "1" : "0");
      for (const k of ["ai_welcome_ar", "ai_welcome_en", "ai_fb_ar", "ai_fb_en", "ai_instr", "ai_info"]) await putSet(k, f(k).trim().slice(0, 4000));
      await putSet("ai_scopes", SCOPES.filter((s) => bool(f("sc_" + s))).join(","));
      await putSet("ai_llm_on", bool(f("ai_llm_on")) ? "1" : "0");
      await putSet("ai_model", f("ai_model").trim().slice(0, 80));
      return "تم حفظ إعدادات المساعد الذكي";
    }
    case "ai_opt_save": {
      const label = f("label_ar").trim().slice(0, 80);
      if (!label) return "اسم الاختيار بالعربية مطلوب";
      const parent = Math.floor(Number(f("parent_id")) || 0), next = Math.floor(Number(f("next_id")) || 0);
      if (parent > 0 && !(await first(`SELECT id FROM ai_options WHERE id = $1`, [parent]))) return "القسم الأب غير موجود";
      if (id > 0 && parent === id) return "لا يمكن أن يكون الاختيار أبًا لنفسه";
      if (id > 0 && parent > 0 && (await descendants(id)).includes(parent)) return "لا يمكن نقل الاختيار داخل أحد فروعه";
      const action = ACTIONS.some((a) => a[0] === f("action")) ? f("action") : "none";
      const sk = SET_KEYS.some((a) => a[0] === f("set_key")) ? f("set_key") : "", ik = INPUT_KEYS.some((a) => a[0] === f("input_key")) ? f("input_key") : "";
      const v = [parent, label, f("label_en").trim().slice(0, 80), f("icon").trim().slice(0, 8), Number(f("sort")) || 0, bool(f("active")), f("text_ar").trim().slice(0, 1000), f("text_en").trim().slice(0, 1000), action, sk, f("set_val").trim().slice(0, 60), ik, next > 0 ? next : 0];
      if (id > 0) await run(`UPDATE ai_options SET parent_id=$1, label_ar=$2, label_en=$3, icon=$4, sort=$5, active=$6, text_ar=$7, text_en=$8, action=$9, set_key=$10, set_val=$11, input_key=$12, next_id=$13 WHERE id=$14`, [...v, id]);
      else await run(`INSERT INTO ai_options (parent_id, label_ar, label_en, icon, sort, active, text_ar, text_en, action, set_key, set_val, input_key, next_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [...v, nowS()]);
      return "تم حفظ الاختيار";
    }
    case "ai_opt_del": {
      const ids = await descendants(id);
      for (const d of ids) { await run(`DELETE FROM ai_options WHERE id = $1`, [d]); await run(`UPDATE ai_options SET next_id = 0 WHERE next_id = $1`, [d]); }
      return `تم حذف الاختيار (${ids.length})`;
    }
    case "ai_opt_up": case "ai_opt_down": {
      const r = await first(`SELECT parent_id FROM ai_options WHERE id = $1`, [id]);
      if (r) await resort(num(r.parent_id), id, act === "ai_opt_up" ? -1 : 1);
      return "تم تغيير الترتيب";
    }
    case "ai_flow_reset": {
      await run(`DELETE FROM ai_options`); await seedFlow(); return "تمت إعادة المسار الافتراضي";
    }
    case "ai_faq_save": {
      const qa = f("q_ar").trim().slice(0, 300), aa = f("a_ar").trim().slice(0, 2000);
      if (!qa || !aa) return "السؤال والجواب بالعربية مطلوبان";
      const v = [qa, f("q_en").trim().slice(0, 300), aa, f("a_en").trim().slice(0, 2000), f("keywords").trim().slice(0, 500), Number(f("sort")) || 0, bool(f("active"))];
      if (id > 0) await run(`UPDATE ai_faq SET q_ar=$1, q_en=$2, a_ar=$3, a_en=$4, keywords=$5, sort=$6, active=$7 WHERE id=$8`, [...v, id]);
      else await run(`INSERT INTO ai_faq (q_ar, q_en, a_ar, a_en, keywords, sort, active, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [...v, nowS()]);
      return "تم حفظ السؤال";
    }
    case "ai_faq_del": await run(`DELETE FROM ai_faq WHERE id = $1`, [id]); return "تم حذف السؤال";
    case "ai_block": {
      const kind = f("kind"), ref = Number(f("ref"));
      if (!SCOPES.includes(kind) || !ref) return "غير صالح";
      if (bool(f("on"))) await run(`DELETE FROM ai_blocked WHERE kind = $1 AND ref = $2`, [kind, ref]);
      else { await run(`DELETE FROM ai_blocked WHERE kind = $1 AND ref = $2`, [kind, ref]); await run(`INSERT INTO ai_blocked (kind, ref) VALUES ($1,$2)`, [kind, ref]); }
      return "تم التحديث";
    }
    case "ai_chat_del": await run(`DELETE FROM ai_chats WHERE user_id = $1`, [Number(f("uid"))]); return "تم حذف المحادثات";
  }
  return "إجراء غير معروف";
}

const sel = (name: string, opts: [string, string][], cur: string, t: (s: string) => string) => `<select class="w" name="${name}">${opts.map(([v, l]) => `<option value="${h(v)}"${v === cur ? " selected" : ""}>${h(t(l))}</option>`).join("")}</select>`;
const cb = (name: string, label: string, on: boolean) => `<label class="row" style="gap:6px"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}> ${h(label)}</label>`;
const fld = (label: string, inner: string) => `<div><label class="f">${h(label)}</label>${inner}</div>`;
const when = (s: number) => new Date(s * 1000).toISOString().replace("T", " ").slice(0, 16);

export async function aiPage(ctx: Ctx): Promise<{ title: string; body: string }> {
  const { t, F, hid, url } = ctx, s = url.searchParams.get("s") || "set", title = t("إدارة المساعد الذكي");
  const tabs: [string, string][] = [["set", "الإعدادات والرسائل"], ["flow", "الأقسام والأسئلة والاختيارات"], ["faq", "الأسئلة الشائعة"], ["items", "المنتجات المسموحة"], ["chats", "المحادثات"]];
  let out = `<div class="tabs">${tabs.map(([k, l]) => `<a class="${s === k ? "on" : ""}" href="/admin?tab=ai&s=${k}">${h(t(l))}</a>`).join("")}</div>`;
  const ex = `&s=${s}`;
  if (s === "set") {
    const g = async (k: string, d = "") => h(await getSet(k, d)), scopes = await allowedScopes(), key = !!env("ANTHROPIC_API_KEY");
    out += `<div class="box"><h2>${h(t("إعدادات المساعد الذكي"))}</h2>${F("ai_set", `
      <p>${cb("ai_on", t("تشغيل المساعد الذكي (عند الإيقاف يختفي من التطبيق)"), (await getSet("ai_on", "1")) === "1")}</p>
      <div class="fg">${fld(t("رسالة الترحيب (عربي)"), `<textarea name="ai_welcome_ar">${await g("ai_welcome_ar", DEF.welcome_ar)}</textarea>`)}${fld(t("رسالة الترحيب (English)"), `<textarea name="ai_welcome_en">${await g("ai_welcome_en", DEF.welcome_en)}</textarea>`)}</div>
      <div class="fg" style="margin-top:10px">${fld(t("رسالة عدم وجود معلومات (عربي)"), `<textarea name="ai_fb_ar">${await g("ai_fb_ar", DEF.fb_ar)}</textarea>`)}${fld(t("رسالة عدم وجود معلومات (English)"), `<textarea name="ai_fb_en">${await g("ai_fb_en", DEF.fb_en)}</textarea>`)}</div>
      <hr class="sep"><p class="hint">${h(t("أنواع البيانات التي يستطيع المساعد البحث فيها واقتراحها:"))}</p>
      <div class="row">${SCOPES.map((k) => cb("sc_" + k, SCOPE_AR[k], scopes.includes(k))).join("")}</div>
      <hr class="sep"><p class="hint">${h(t("تعليمات الذكاء الاصطناعي ومعلومات إضافية يمكنه استخدامها (تُستخدم عند تفعيل الذكاء الاصطناعي للأسئلة الحرة فقط)."))}</p>
      <p>${cb("ai_llm_on", t("تفعيل الذكاء الاصطناعي للأسئلة الحرة التي لا يجد لها المساعد جوابًا في الأسئلة الشائعة أو المنتجات") + (key ? "" : " — " + t("يتطلب إضافة مفتاح ANTHROPIC_API_KEY في إعدادات الخادم")), (await getSet("ai_llm_on", "0")) === "1")}</p>
      <div class="fg">${fld(t("تعليمات المساعد"), `<textarea name="ai_instr" style="min-height:110px">${await g("ai_instr", DEF.instr)}</textarea>`)}${fld(t("معلومات يستطيع المساعد استخدامها (ساعات العمل، السياسات...)"), `<textarea name="ai_info" style="min-height:110px">${await g("ai_info")}</textarea>`)}</div>
      <p style="margin-top:10px">${fld(t("نموذج الذكاء الاصطناعي (اختياري)"), `<input type="text" class="w mono" name="ai_model" value="${await g("ai_model")}" placeholder="claude-haiku-4-5-20251001">`)}</p>
      <button class="y">${h(t("حفظ"))}</button>`, ex)}</div>
      <p class="hint">${h(t("الأقسام والأزرار والأسئلة تُدار من «الأقسام والأسئلة والاختيارات»، وتظهر للمستخدمين فورًا بدون تحديث التطبيق. لن يعرض المساعد أي منتج أو سعر أو مخزون غير موجود في قاعدة البيانات."))}</p>`;
  } else if (s === "flow") {
    const all = await run(`SELECT * FROM ai_options ORDER BY sort, id`);
    const byP = new Map<number, Row[]>(); for (const r of all) { const p = num(r.parent_id); byP.set(p, [...(byP.get(p) ?? []), r]); }
    const label = (r: Row) => `${r.icon ? r.icon + " " : ""}${r.label_ar}`;
    const parentOpts: [string, string][] = [["0", "— القائمة الرئيسية —"], ["-1", "— مخفي (يُستخدم كخطوة تالية فقط) —"], ...all.map((r) => [String(r.id), "↳ " + label(r)] as [string, string])];
    const nextOpts: [string, string][] = [["0", "— لا شيء —"], ...all.map((r) => [String(r.id), label(r)] as [string, string])];
    const form = (r: Row | null, depth = 0) => {
      const v = (k: string, d = "") => h(r ? r[k] : d);
      return `<details class="item" style="margin-inline-start:${depth * 18}px"${r ? "" : " open"}><summary>${r ? `<b>${h(label(r))}</b> ${num(r.active) ? "" : statusChip("bad", t("مخفي"))} <span class="sm">${h(ACTIONS.find((a) => a[0] === r.action)?.[1] ?? "")}${r.input_key ? " · " + t("إدخال") + ": " + r.input_key : ""}${r.set_key ? " · " + r.set_key + "=" + r.set_val : ""}</span>` : `<b>${h(t("إضافة اختيار / قسم / سؤال"))}</b>`}</summary>
      ${F("ai_opt_save", `${r ? hid("id", r.id) : ""}
      <div class="fg">${fld(t("الاسم (عربي)"), `<input type="text" class="w" name="label_ar" value="${v("label_ar")}" required>`)}${fld("Name (English)", `<input type="text" class="w" name="label_en" value="${v("label_en")}">`)}${fld(t("الأيقونة (إيموجي)"), `<input type="text" class="w" name="icon" value="${v("icon")}" maxlength="8">`)}</div>
      <div class="fg" style="margin-top:8px">${fld(t("يظهر داخل"), sel("parent_id", parentOpts.filter(([id]) => !r || id !== String(r.id)), String(r ? num(r.parent_id) : 0), t))}${fld(t("الترتيب (رقم)"), `<input type="text" class="w" name="sort" value="${r ? num(r.sort) : all.length * 10}" inputmode="numeric">`)}</div>
      <div class="fg" style="margin-top:8px">${fld(t("نص السؤال / الجواب (عربي)"), `<textarea name="text_ar">${v("text_ar")}</textarea>`)}${fld("Question / answer text (English)", `<textarea name="text_en">${v("text_en")}</textarea>`)}</div>
      <div class="fg" style="margin-top:8px">${fld(t("الإجراء بعد الضغط"), sel("action", ACTIONS, r?.action ?? "none", t))}${fld(t("حفظ قيمة عند الضغط"), sel("set_key", SET_KEYS, r?.set_key ?? "", t))}${fld(t("القيمة"), `<input type="text" class="w mono" name="set_val" value="${v("set_val")}" placeholder="farm / 100 / 20">`)}</div>
      <div class="fg" style="margin-top:8px">${fld(t("السماح للمستخدم بكتابة قيمة"), sel("input_key", INPUT_KEYS, r?.input_key ?? "", t))}${fld(t("ثم الانتقال إلى"), sel("next_id", nextOpts.filter(([id]) => !r || id !== String(r.id)), String(r ? num(r.next_id) : 0), t))}</div>
      <p style="margin-top:8px">${cb("active", t("مفعّل"), r ? !!num(r.active) : true)}</p><button class="y">${h(t("حفظ"))}</button>`, ex)}
      ${r ? `<div class="acts">${F("ai_opt_up", hid("id", r.id) + `<button class="s">▲</button>`, ex)}${F("ai_opt_down", hid("id", r.id) + `<button class="s">▼</button>`, ex)}${F("ai_opt_del", hid("id", r.id) + `<button class="r s" onclick="return confirm('${h(t("حذف هذا الاختيار وكل ما بداخله؟"))}')">${h(t("حذف"))}</button>`, ex)}</div>` : ""}</details>`;
    };
    const walk = (p: number, d: number): string => (byP.get(p) ?? []).map((r) => form(r, d) + walk(num(r.id), d + 1)).join("");
    out += `<p class="hint">${h(t("هذا هو مسار المحادثة: كل اختيار يمكن أن يعرض سؤالًا وأزرارًا فرعية، أو يحفظ قيمة (مثل المستوى أو الميزانية)، أو ينتقل لسؤال آخر، أو يبحث في المنتجات ويعرض النتائج المطابقة فقط."))}</p>
      <div class="box">${form(null)}</div><h2>${h(t("القائمة الرئيسية"))}</h2>${walk(0, 0)}<h2>${h(t("خطوات مخفية (أسئلة تالية ونتائج)"))}</h2>${walk(-1, 0)}
      <div class="box">${F("ai_flow_reset", `<button class="r s" onclick="return confirm('${h(t("سيُحذف المسار الحالي ويُستبدل بالمسار الافتراضي. متأكد؟"))}')">${h(t("إعادة المسار الافتراضي"))}</button>`, ex)}</div>`;
  } else if (s === "faq") {
    const form = (r: Row | null) => `<div class="item">${F("ai_faq_save", `${r ? hid("id", r.id) : ""}
      <div class="fg">${fld(t("السؤال (عربي)"), `<input type="text" class="w" name="q_ar" value="${h(r?.q_ar ?? "")}" required>`)}${fld("Question (English)", `<input type="text" class="w" name="q_en" value="${h(r?.q_en ?? "")}">`)}</div>
      <div class="fg" style="margin-top:8px">${fld(t("الجواب (عربي)"), `<textarea name="a_ar" required>${h(r?.a_ar ?? "")}</textarea>`)}${fld("Answer (English)", `<textarea name="a_en">${h(r?.a_en ?? "")}</textarea>`)}</div>
      <div class="fg" style="margin-top:8px">${fld(t("كلمات مفتاحية (مفصولة بفاصلة)"), `<input type="text" class="w" name="keywords" value="${h(r?.keywords ?? "")}">`)}${fld(t("الترتيب (رقم)"), `<input type="text" class="w" name="sort" value="${r ? num(r.sort) : 0}" inputmode="numeric">`)}</div>
      <p style="margin-top:8px">${cb("active", t("مفعّل"), r ? !!num(r.active) : true)}</p><button class="y">${h(t("حفظ"))}</button>`, ex)}
      ${r ? `<div class="acts">${F("ai_faq_del", hid("id", r.id) + `<button class="r s" onclick="return confirm('${h(t("حذف السؤال؟"))}')">${h(t("حذف"))}</button>`, ex)}</div>` : ""}</div>`;
    out += `<p class="hint">${h(t("عندما يكتب المستخدم سؤالًا يحتوي إحدى الكلمات المفتاحية (أو يشبه السؤال) يُعرض الجواب مباشرة."))}</p><div class="box"><h2>${h(t("إضافة سؤال شائع"))}</h2>${form(null)}</div>`;
    for (const r of await run(`SELECT * FROM ai_faq ORDER BY sort, id`)) out += form(r);
  } else if (s === "items") {
    const blocked = new Set((await run(`SELECT kind, ref FROM ai_blocked`)).map((r) => r.kind + ":" + num(r.ref)));
    const rows: [string, number, string, number][] = [];
    for (const r of await run(`SELECT id, name, price FROM farms WHERE active = 1 AND sold = 0 ORDER BY id DESC LIMIT 300`)) rows.push(["farm", num(r.id), r.name, num(r.price)]);
    for (const r of await run(`SELECT id, name, price, kind FROM products WHERE active = 1 ORDER BY id LIMIT 500`)) rows.push([r.kind === "code" ? "code" : "tool", num(r.id), r.name, num(r.price)]);
    for (const r of await run(`SELECT id, name, price FROM random_boxes WHERE active = 1 ORDER BY id`)) rows.push(["box", num(r.id), r.name, num(r.price)]);
    out += `<p class="hint">${h(t("المنتجات الموقوفة لن يقترحها المساعد للمستخدمين. (منتجات «اختياري» تُتحكم بها كنوع كامل من تبويب الإعدادات.)"))}</p>`;
    for (const [k, id2, name, price] of rows) {
      const on = !blocked.has(k + ":" + id2);
      out += `<div class="item"><div class="row"><b>${h(name)}</b><span class="chip">${h(SCOPE_AR[k])}</span><span class="sm">${fmtP(price)} USDT</span>${on ? statusChip("ok", t("مسموح")) : statusChip("bad", t("موقوف"))}${F("ai_block", `${hid("kind", k)}${hid("ref", id2)}${hid("on", on ? 0 : 1)}<button class="s ${on ? "r" : "y"}">${h(on ? t("إيقاف الاقتراح") : t("السماح"))}</button>`, ex)}</div></div>`;
    }
    if (!rows.length) out += `<p class="hint">${h(t("لا توجد منتجات."))}</p>`;
  } else {
    const uid = Number(url.searchParams.get("u")) || 0;
    if (uid) {
      const u = await first(`SELECT username FROM users WHERE id = $1`, [uid]);
      const ms = (await run(`SELECT role, text, miss, created_at FROM ai_chats WHERE user_id = $1 ORDER BY id DESC LIMIT 300`, [uid])).reverse();
      out += `<div class="box"><h2>${h(u?.username ?? "#" + uid)}</h2><div class="chat">${ms.map((m) => `<div class="bub ${m.role === "bot" ? "a" : "u"}" style="white-space:pre-wrap">${h(m.text)}${num(m.miss) ? ` <span class="chip bad">${h(t("بدون جواب"))}</span>` : ""}<br><small style="opacity:.6">${when(num(m.created_at))}</small></div>`).join("")}</div>
        ${F("ai_chat_del", `${hid("uid", uid)}<button class="r s" onclick="return confirm('${h(t("حذف كل محادثات هذا المستخدم؟"))}')">${h(t("حذف المحادثات"))}</button>`, ex)}</div><p><a href="/admin?tab=ai&s=chats">← ${h(t("رجوع"))}</a></p>`;
    } else {
      const miss = url.searchParams.get("miss") === "1";
      out += `<div class="tabs"><a class="${miss ? "" : "on"}" href="/admin?tab=ai&s=chats">${h(t("كل المستخدمين"))}</a><a class="${miss ? "on" : ""}" href="/admin?tab=ai&s=chats&miss=1">${h(t("أسئلة بدون جواب"))}</a></div>`;
      if (miss) {
        for (const r of await run(`SELECT c.user_id, c.text, c.created_at, u.username FROM ai_chats c LEFT JOIN users u ON u.id = c.user_id WHERE c.role = 'user' AND c.miss = 1 ORDER BY c.id DESC LIMIT 100`))
          out += `<div class="item"><a href="/admin?tab=ai&s=chats&u=${num(r.user_id)}"><b>${h(r.username ?? "#" + r.user_id)}</b></a> <span class="sm">${when(num(r.created_at))}</span><div style="white-space:pre-wrap">${h(r.text)}</div></div>`;
      } else {
        for (const r of await run(`SELECT c.user_id, u.username, COUNT(*) n, MAX(c.created_at) lastt, SUM(c.miss) m FROM ai_chats c LEFT JOIN users u ON u.id = c.user_id GROUP BY c.user_id, u.username ORDER BY lastt DESC LIMIT 100`))
          out += `<div class="item"><a href="/admin?tab=ai&s=chats&u=${num(r.user_id)}"><b>${h(r.username ?? "#" + r.user_id)}</b></a> <span class="sm">${num(r.n)} ${h(t("رسالة"))} · ${when(num(r.lastt))}</span>${num(r.m) ? ` <span class="chip bad">${num(r.m)} ${h(t("بدون جواب"))}</span>` : ""}</div>`;
      }
      if (!out.includes('class="item"')) out += `<p class="hint">${h(t("لا توجد محادثات بعد."))}</p>`;
    }
  }
  return { title, body: out };
}
