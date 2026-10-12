// Hay Day weekly events: manual events, weekly recurring rules and optional import from a trusted external feed (JSON / iCal).
// All times are stored as UTC epoch seconds (the game's own clock is UTC; weekly events start Monday 08:00 UTC).
import { run, first, count, num, nowS, serial, Row, h, ok, getSet, putSet, okImg, env } from "./core";
import { IMG, imgUrl, WEB_ORIGIN, pushAll } from "./shop";
import type { Ctx } from "./panel_ui";
import { statusChip, fmtT, picker, field, PICK_JS } from "./panel_ui";

await run(`CREATE TABLE IF NOT EXISTS hd_events (id ${serial}, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'other', image TEXT,
  start_at BIGINT NOT NULL, end_at BIGINT NOT NULL, rewards TEXT NOT NULL DEFAULT '', rewards_en TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', ext_id TEXT NOT NULL DEFAULT '',
  active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS hd_event_rules (id ${serial}, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'other', weekday INT NOT NULL, hour INT NOT NULL, minute INT NOT NULL DEFAULT 0,
  duration_h INT NOT NULL, rewards TEXT NOT NULL DEFAULT '', rewards_en TEXT NOT NULL DEFAULT '', active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);

await run(`CREATE TABLE IF NOT EXISTS hd_news (id ${serial}, title TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', cat TEXT NOT NULL DEFAULT 'news',
  image TEXT, link TEXT NOT NULL DEFAULT '', pinned INT NOT NULL DEFAULT 0, published_at BIGINT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', ext_id TEXT NOT NULL DEFAULT '', active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);

try { await run(`ALTER TABLE hd_events ADD COLUMN pinned INT NOT NULL DEFAULT 0`); } catch {}
try { await run(`ALTER TABLE hd_news ADD COLUMN tr_edited INT NOT NULL DEFAULT 0`); } catch {}

export const NCATS: [string, string][] = [["events", "أحداث"], ["updates", "تحديثات"], ["news", "أخبار"]];
const CAT_OK = new Set(NCATS.map((c) => c[0]));
export const KINDS: [string, string, string][] = [
  ["truck", "الشاحنة", "Truck"], ["boat", "السفينة", "Boat"], ["town", "البلدة", "Town"], ["xp2", "مضاعفة الخبرة 2XP", "2XP"], ["derby", "الدربي", "Derby"],
  ["valley", "الوادي", "Valley"], ["fishing", "الصيد", "Fishing"], ["seasonal", "موسمي", "Seasonal"], ["other", "أخرى", "Other"],
];
const KIND_OK = new Set(KINDS.map((k) => k[0]));
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MAX_LEN = 60 * 86400, KEEP_ENDED = 3 * 86400;

const defImg = (kind: string) => `${WEB_ORIGIN}/img/events/${KIND_OK.has(kind) ? kind : "other"}.svg`;
const status = (s: number, e: number, n: number) => (n >= e ? "ended" : n >= s ? "running" : "upcoming");

type Ev = { id: string; name: string; name_en: string; kind: string; image: string; start: number; end: number; rewards: string; rewards_en: string; status: string; auto: number; pin?: number };

/** Expand weekly rules into concrete occurrences around now. */
async function ruleEvents(n: number): Promise<Ev[]> {
  const rules = await run(`SELECT * FROM hd_event_rules WHERE active = 1`);
  const out: Ev[] = [];
  const day0 = Math.floor(n / 86400) * 86400;
  for (const r of rules) {
    for (let d = -8; d <= 21; d++) {
      const ds = day0 + d * 86400;
      if (new Date(ds * 1000).getUTCDay() !== num(r.weekday)) continue;
      const s = ds + num(r.hour) * 3600 + num(r.minute) * 60, e = s + num(r.duration_h) * 3600;
      out.push({ id: `r${r.id}-${s}`, name: r.name, name_en: r.name_en || "", kind: r.kind, image: defImg(r.kind), start: s, end: e, rewards: r.rewards || "", rewards_en: r.rewards_en || "", status: status(s, e, n), auto: 1 });
    }
  }
  return out;
}

export async function listEvents(): Promise<{ now: number; updated_at: number; events: Ev[] }> {
  const n = nowS();
  const rows = await run(`SELECT e.id, e.name, e.name_en, e.kind, e.rewards, e.rewards_en, e.start_at, e.end_at, e.updated_at, e.pinned, ${IMG("image", "e.")} FROM hd_events e WHERE e.active = 1 AND e.end_at > $1 ORDER BY e.start_at, e.id`, [n - KEEP_ENDED]);
  const evs: Ev[] = rows.map((r) => ({ id: "e" + r.id, name: r.name, name_en: r.name_en || "", kind: r.kind, image: imgUrl("e", r) ?? defImg(r.kind), start: num(r.start_at), end: num(r.end_at), rewards: r.rewards || "", rewards_en: r.rewards_en || "", status: status(num(r.start_at), num(r.end_at), n), auto: 0, pin: num(r.pinned) }));
  for (const x of await ruleEvents(n)) if (x.end > n - KEEP_ENDED) evs.push(x);
  const order: Record<string, number> = { running: 0, upcoming: 1, ended: 2 };
  evs.sort((a, b) => order[a.status] - order[b.status] || (b.pin ?? 0) - (a.pin ?? 0) || (a.status === "ended" ? b.end - a.end : a.start - b.start) || a.name.localeCompare(b.name));
  const upd = Math.max(num((await first(`SELECT MAX(updated_at) m FROM hd_events`))?.m), num((await first(`SELECT MAX(updated_at) m FROM hd_event_rules`))?.m), num(await getSet("ev_sync_at", "0")));
  return { now: n, updated_at: upd, events: evs };
}

export async function listNews() {
  const rows = await run(`SELECT n.id, n.title, n.title_en, n.body, n.body_en, n.cat, n.link, n.pinned, n.published_at, n.updated_at, n.source, ${IMG("image", "n.")} FROM hd_news n WHERE n.active = 1 ORDER BY n.pinned DESC, n.published_at DESC, n.id DESC LIMIT 60`);
  const upd = Math.max(num((await first(`SELECT MAX(updated_at) m FROM hd_news`))?.m), num(await getSet("news_sync_at", "0")));
  return {
    now: nowS(), updated_at: upd, synced_at: Math.max(num(await getSet("news_sync_try", "0")), upd), note: await getSet("news_note"),
    items: rows.map(newsOut),
  };
}
const newsOut = (r: Row) => ({ id: num(r.id), title: r.title, title_en: r.title_en || "", body: r.body, body_en: r.body_en || "", cat: r.cat, image: imgUrl("w", r), link: r.link || "", pinned: num(r.pinned), date: num(r.published_at), official: r.source === "import" ? 1 : 0 });
export async function newsOne(id: number) {
  const r = await first(`SELECT n.id, n.title, n.title_en, n.body, n.body_en, n.cat, n.link, n.pinned, n.published_at, n.source, ${IMG("image", "n.")} FROM hd_news n WHERE n.id = $1 AND n.active = 1`, [id]);
  return r ? newsOut(r) : null;
}

export const EV: Record<string, (b: Row) => Promise<Response>> = {
  async hd_news() { return ok(await listNews()); },
  async hd_events() {
    const r = await listEvents();
    return ok({ ...r, kinds: KINDS.map((k) => ({ k: k[0], ar: k[1], en: k[2] })) });
  },
};

// ---------- external import ----------
const toSec = (v: any): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) { const x = Number(v); return Math.floor(x > 1e11 ? x / 1000 : x); }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/); // iCal basic
  const d = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.parse(/[zZ]|GMT|UTC|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z");
  return Number.isFinite(d) ? Math.floor(d / 1000) : 0;
};
const guessKind = (s: string) => {
  const x = s.toLowerCase();
  if (/truck|شاحن/.test(x)) return "truck"; if (/boat|ship|سفين|قارب/.test(x)) return "boat"; if (/town|visitor|بلد/.test(x)) return "town";
  if (/2x|double|xp|خبرة/.test(x)) return "xp2"; if (/derby|دربي/.test(x)) return "derby"; if (/valley|وادي/.test(x)) return "valley"; if (/fish|صيد/.test(x)) return "fishing";
  return "other";
};
export function parseFeed(text: string): { ext: string; name: string; name_en: string; kind: string; s: number; e: number; rewards: string; image: string }[] {
  const out: any[] = [];
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    const j = JSON.parse(t); const arr: any[] = Array.isArray(j) ? j : Array.isArray(j.events) ? j.events : [];
    for (const x of arr) {
      const name = String(x.name ?? x.title ?? x.name_ar ?? "").trim(), en = String(x.name_en ?? x.title_en ?? "").trim();
      const s = toSec(x.start ?? x.start_at ?? x.startTime ?? x.begin), e = toSec(x.end ?? x.end_at ?? x.endTime ?? x.finish);
      const kind = KIND_OK.has(String(x.kind ?? x.type)) ? String(x.kind ?? x.type) : guessKind(name + " " + en);
      const img = String(x.image ?? x.img ?? "");
      if ((name || en) && s && e) out.push({ ext: String(x.id ?? `${name || en}|${s}`).slice(0, 120), name: name || en, name_en: en, kind, s, e, rewards: String(x.rewards ?? x.reward ?? x.descr ?? "").slice(0, 400), image: /^https:\/\//.test(img) ? img.slice(0, 500) : "" });
    }
  } else if (t.includes("BEGIN:VEVENT")) {
    const un = t.replace(/\r?\n[ \t]/g, "");
    for (const blk of un.split("BEGIN:VEVENT").slice(1)) {
      const g = (k: string) => (blk.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1] ?? "").replace(/\r/g, "").replace(/\\,/g, ",").replace(/\\n/gi, " ").trim();
      const name = g("SUMMARY"), s = toSec(g("DTSTART")), e = toSec(g("DTEND")) || s + 86400;
      if (name && s) out.push({ ext: g("UID") || `${name}|${s}`, name, name_en: "", kind: guessKind(name), s, e, rewards: g("DESCRIPTION").slice(0, 400), image: "" });
    }
  } else throw new Error("صيغة غير مدعومة (JSON أو iCal فقط)");
  return out;
}

export async function syncEvents(): Promise<string> {
  const url = (await getSet("ev_src_url")).trim();
  if (!/^https:\/\//.test(url)) return "لم يُضبط رابط مصدر الاستيراد (https)";
  let msg = "";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json, text/calendar, */*" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const text = (await r.text()).slice(0, 2_000_000);
    const items = parseFeed(text).filter((x) => x.e > x.s && x.e - x.s <= MAX_LEN).slice(0, 500);
    const n = nowS(); let add = 0, upd = 0, pushed = 0;
    const firstRun = (await getSet("ev_first_done")) !== "1";
    for (const x of items) {
      const ex = await first(`SELECT id, source, name, name_en, kind, start_at, end_at, rewards FROM hd_events WHERE ext_id = $1`, [x.ext]);
      if (!ex) {
        const ins = (await run(`INSERT INTO hd_events (name, name_en, kind, image, start_at, end_at, rewards, source, ext_id, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'import',$8,1,$9,$9) RETURNING id`, [x.name, x.name_en, x.kind, x.image || null, x.s, x.e, x.rewards, x.ext, n]))[0]; add++;
        if (!firstRun && ins && x.e > n && (await getSet("ev_notify", "1")) === "1") { await notifyEventItem(num(ins.id), x.name, x.rewards); pushed++; }
      }
      else if (ex.source === "import" && (ex.name !== x.name || num(ex.start_at) !== x.s || num(ex.end_at) !== x.e || ex.rewards !== x.rewards || ex.kind !== x.kind)) {
        await run(`UPDATE hd_events SET name=$1, name_en=$2, kind=$3, start_at=$4, end_at=$5, rewards=$6, updated_at=$7 WHERE id=$8`, [x.name, x.name_en, x.kind, x.s, x.e, x.rewards, n, ex.id]); upd++;
      }
    }
    msg = `تمت المزامنة: ${items.length} حدث في المصدر · جديد ${add} · محدَّث ${upd}` + (pushed ? ` · إشعارات ${pushed}` : "");
    await putSet("ev_first_done", "1"); await putSet("ev_sync_stats", JSON.stringify([add, upd, pushed]));
    await putSet("ev_sync_ok", "1");
    if (add || upd) await putSet("ev_sync_at", String(n)); else await putSet("ev_sync_at", String(num(await getSet("ev_sync_at", "0")) || n));
  } catch (e: any) { msg = "فشلت المزامنة: " + String(e?.message ?? e).slice(0, 120); await putSet("ev_sync_ok", "0"); }
  await putSet("ev_sync_try", String(nowS())); await putSet("ev_sync_msg", msg);
  return msg;
}

// ---------- news feed import (RSS / Atom / JSON) ----------
const strip = (x: string) => x.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const guessCat = (s: string) => (/event|derby|week|truck|boat|حدث|أسبوع/i.test(s) ? "events" : /update|patch|release|version|تحديث/i.test(s) ? "updates" : "news");
type NewsIn = { ext: string; title: string; body: string; cat: string; image: string; link: string; date: number; pinned: number };
export function parseNews(text: string): NewsIn[] {
  const out: NewsIn[] = [], t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    const j = JSON.parse(t); const arr: any[] = Array.isArray(j) ? j : j.items ?? j.news ?? j.posts ?? j.data ?? [];
    for (const x of arr) {
      const title = String(x.title ?? x.name ?? "").trim(); if (!title) continue;
      const img = String(x.image ?? x.img ?? x.thumbnail ?? ""), link = String(x.url ?? x.link ?? "");
      out.push({ ext: String(x.id ?? x.guid ?? link ?? title).slice(0, 200), title: title.slice(0, 200), body: strip(String(x.body ?? x.text ?? x.description ?? x.summary ?? x.content ?? "")).slice(0, 4000),
        cat: CAT_OK.has(String(x.cat ?? x.category ?? x.type)) ? String(x.cat ?? x.category ?? x.type) : guessCat(title), image: /^https:\/\//.test(img) ? img.slice(0, 600) : "", link: /^https:\/\//.test(link) ? link.slice(0, 600) : "",
        date: toSec(x.date ?? x.published_at ?? x.published ?? x.created_at ?? x.time) || nowS(), pinned: x.pinned ? 1 : 0 });
    }
  } else if (/<(rss|feed)[\s>]/i.test(t)) {
    for (const blk of t.split(/<(?:item|entry)[\s>]/i).slice(1)) {
      const g = (tag: string) => (blk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? "");
      const title = strip(g("title")); if (!title) continue;
      const link = (blk.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? strip(g("link"))).trim();
      const raw = g("content:encoded") || g("content") || g("description") || g("summary");
      const img = blk.match(/<(?:enclosure|media:content|media:thumbnail)[^>]*url="([^"]+)"/i)?.[1] ?? raw.match(/<img[^>]*src=["']([^"']+)/i)?.[1] ?? "";
      out.push({ ext: (strip(g("guid")) || strip(g("id")) || link || title).slice(0, 200), title: title.slice(0, 200), body: strip(raw).slice(0, 4000), cat: guessCat(title + " " + strip(g("category"))),
        image: /^https:\/\//.test(img) ? img.slice(0, 600) : "", link: /^https:\/\//.test(link) ? link.slice(0, 600) : "", date: toSec(strip(g("pubDate") || g("published") || g("updated"))) || nowS(), pinned: 0 });
    }
  } else throw new Error("صيغة غير مدعومة (RSS أو Atom أو JSON فقط)");
  return out;
}
// ---------- official Supercell blog scraper (the blog has no RSS/JSON feed) ----------
export const NEWS_DEFAULT_SRC = "https://hayday.inbox.supercell.com/data/ar/news/content.json";
export const NEWS_BLOG = "https://supercell.com/en/games/hayday/blog/";
const UA = "HDMarketNewsBot/1.0 (+news aggregator; respects source links)";
const fetchText = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/json,*/*" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.text()).slice(0, 3_000_000);
};
const decode = (x: string) => x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(+d, 0x10ffff)));
const blockText = (html: string) => decode(html.replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|li|h[1-6]|tr|section)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const meta = (html: string, k: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
  return m ? decode(m[1]).trim() : "";
};
const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** Publish date of an article; 0 when none can be found (never guessed). */
export function articleDate(html: string): number {
  const iso = meta(html, "article:published_time") || meta(html, "og:article:published_time") || html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] || html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || "";
  if (iso) { const d = toSec(iso); if (d > 1e9) return d; }
  const t = blockText(html.slice(0, 400000));
  const m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d{2})\b/i) ?? null;
  if (m) return Math.floor(Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1], 8) / 1000);
  const m2 = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
  return m2 ? Math.floor(Date.UTC(+m2[3], MON[m2[1].toLowerCase()], +m2[2], 8) / 1000) : 0;
}
export function blogLinks(html: string, base: string): string[] {
  const out = new Set<string>(), u = new URL(base);
  for (const m of html.matchAll(/href=["']([^"'#?]+)["']/gi)) {
    let abs: URL; try { abs = new URL(decode(m[1]), base); } catch { continue; }
    if (abs.hostname !== u.hostname) continue;
    const mm = abs.pathname.match(/^(\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?games\/hayday\/blog\/([a-z0-9-]+)\/[a-z0-9][a-z0-9-]*)\/?$/i);
    if (mm && !/^(page|tag|category)$/i.test(mm[2])) out.add(abs.origin + mm[1] + "/");
  }
  return [...out];
}
const pick = (x: any, ...ks: string[]) => { for (const k of ks) { const v = x?.[k]; if (v != null && v !== "" && typeof v !== "object") return String(v); } return ""; };
const findArr = (j: any, d = 0): any[] => {
  if (Array.isArray(j)) return j.length && typeof j[0] === "object" ? j : [];
  if (j && typeof j === "object" && d < 4) { for (const v of Object.values(j)) { const a = findArr(v, d + 1); if (a.length) return a; } }
  return [];
};
const absUrl = (u: string, base: string) => { try { return /^https:\/\//.test(u) || u.startsWith("/") || /^[\w.-]+\//.test(u) ? new URL(u, base).href : ""; } catch { return ""; } };
/** Tolerant parser for the official Hay Day inbox JSON (field names are matched loosely). */
export function parseInboxJson(text: string, base: string): (NewsIn & { id: string })[] {
  const arr = findArr(JSON.parse(text)), out: (NewsIn & { id: string })[] = [];
  for (const x of arr) {
    const title = strip(pick(x, "title", "headline", "name", "header")); if (!title) continue;
    const bodyRaw = pick(x, "body", "text", "description", "content", "message", "summary", "subtitle");
    const img = absUrl(pick(x, "image", "imageUrl", "image_url", "img", "thumbnail", "banner", "picture", "cover"), base);
    const link = absUrl(pick(x, "url", "link", "cta", "href", "readMore", "read_more", "buttonUrl"), base);
    const d = toSec(pick(x, "date", "published", "publishedAt", "published_at", "publishDate", "time", "timestamp", "startTime", "created", "created_at"));
    const id = pick(x, "id", "guid", "uuid", "key", "slug") || link || title;
    if (!d) continue;
    out.push({ id: id.slice(0, 200), ext: id.slice(0, 200), title: title.slice(0, 200), body: strip(bodyRaw.replace(/<\/(p|div|li)>|<br\s*\/?>/gi, "\n")).slice(0, 4000), cat: CAT_OK.has(pick(x, "cat", "category", "type")) ? pick(x, "cat", "category", "type") : guessCat(title + " " + pick(x, "category", "type", "tag")), image: img.slice(0, 600), link: link.slice(0, 600), date: d, pinned: 0 });
  }
  return out;
}
export async function articleFrom(url: string): Promise<NewsIn | null> {
  const html = await fetchText(url);
  const title = (meta(html, "og:title") || decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "") ?? "")).replace(/\s*[|–-]\s*(Supercell|Hay Day).*$/i, "").trim();
  if (!title) return null;
  const date = articleDate(html); if (!date) return null;
  const main = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? "";
  let body = blockText(main);
  const desc = meta(html, "og:description") || meta(html, "description");
  if (body.toLowerCase().startsWith(title.toLowerCase())) body = body.slice(title.length).trim();
  if (body.length < 40) body = desc;
  const img = meta(html, "og:image"), seg = new URL(url).pathname.match(/\/blog\/([a-z0-9-]+)\//i)?.[1] ?? "";
  const cat = /update|patch|release/i.test(seg) ? "updates" : /event|season/i.test(seg) ? "events" : guessCat(title + " " + seg);
  return { ext: url, title: title.slice(0, 200), body: body.slice(0, 4000), cat, image: /^https:\/\//.test(img) ? img.slice(0, 600) : "", link: url, date, pinned: 0 };
}
async function notifyAll(emoji: string, id: number, title: string, body: string, ref: string, screen: string): Promise<number> {
  const t = nowS(), bd = body.replace(/\s+/g, " ").slice(0, 110);
  const users = await run(`SELECT id FROM users`);
  for (const u of users) await run(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,'announce',$2,$3,$2,$3,$4,$5)`, [u.id, emoji + " " + title.slice(0, 120), bd, ref, t]);
  await pushAll(emoji + " " + title.slice(0, 80), bd || "جديد في Hay Day", screen);
  return users.length;
}
const notifyNewsItem = (id: number, title: string, body: string) => notifyAll("📰", id, title, body, "NEWS-" + id, "news");
const notifyEventItem = (id: number, title: string, body: string) => notifyAll("📅", id, title, body, "EV-" + id, "events");
const FRESH = 7 * 86400;
const maxDays = async () => Math.max(1, num(await getSet("news_max_days", "60")) || 60);
async function loadItems(url: string): Promise<{ items: (NewsIn & { en?: { title: string; body: string } })[]; skipped: number }> {
  const text = await fetchText(url);
  if (/<(!doctype html|html)[\s>]/i.test(text.slice(0, 2000))) {
    const links = blogLinks(text, url), items: NewsIn[] = []; let skipped = 0;
    if (!links.length) throw new Error("لم يتم العثور على مقالات في الصفحة (قد يكون تصميم المصدر تغيّر)");
    let fetched = 0;
    for (const l of links) {
      if (await first(`SELECT id FROM hd_news WHERE ext_id = $1 OR link = $1`, [l])) continue;
      if (fetched++ >= 15) break;
      try { const a = await articleFrom(l); if (a) items.push(a); else skipped++; } catch { skipped++; }
    }
    return { items, skipped };
  }
  const t = text.trim();
  if ((t.startsWith("{") || t.startsWith("[")) && /\/data\/[a-z]{2}\/news\//i.test(url)) {
    const ar = parseInboxJson(t, url);
    if (!ar.length) { const keys = Object.keys(JSON.parse(t) ?? {}).slice(0, 8).join(","); throw new Error("لم أجد أخبارًا في ملف المصدر (الحقول: " + keys + ")"); }
    let en = new Map<string, { title: string; body: string }>();
    try { for (const e of parseInboxJson(await fetchText(url.replace(/\/data\/[a-z]{2}\//i, "/data/en/")), url.replace(/\/data\/[a-z]{2}\//i, "/data/en/"))) en.set(e.id, { title: e.title, body: e.body }); } catch {}
    return { items: ar.map((x) => ({ ...x, en: en.get(x.id) })), skipped: 0 };
  }
  return { items: parseNews(text).slice(0, 100), skipped: 0 };
}
export async function syncNews(): Promise<string> {
  const custom = (await getSet("news_src_url")).trim(), url = custom || NEWS_DEFAULT_SRC;
  if (!/^https:\/\//.test(url) && !(env("DEBUG_RETURN_CODE") && /^http:\/\/127\.0\.0\.1[:/]/.test(url))) return "رابط مصدر الأخبار غير صالح (https)";
  let msg = "", good = "0";
  try {
    let r: Awaited<ReturnType<typeof loadItems>>, note = "";
    try { r = await loadItems(url); if (!r.items.length && !custom) throw new Error("فارغ"); }
    catch (e: any) { if (custom) throw e; note = " (المصدر الأساسي تعذّر: " + String(e?.message ?? e).slice(0, 60) + " — استُخدمت المدونة الرسمية)"; r = await loadItems(NEWS_BLOG); }
    const { items, skipped } = r;
    const n = nowS(), cutoff = n - (await maxDays()) * 86400; let add = 0, upd = 0, pushed = 0;
    const firstRun = (await getSet("news_first_done")) !== "1";
    for (const x of items) {
      const tEn = x.en?.title || x.title, bEn = x.en ? x.en.body : x.body;
      const ex = await first(`SELECT id, source, title, title_en, body, body_en, link FROM hd_news WHERE ext_id = $1 OR (link <> '' AND link = $2)`, [x.ext, x.link]);
      if (!ex) {
        const fresh = x.date > cutoff;
        const ins = (await run(`INSERT INTO hd_news (title, title_en, body, body_en, cat, image, link, pinned, published_at, source, ext_id, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'import',$10,$11,$12,$12) RETURNING id`, [x.title, tEn, x.body, bEn, x.cat, x.image || null, x.link, x.pinned, x.date, x.ext, fresh ? 1 : 0, n]))[0];
        add++;
        // only genuinely fresh posts notify users; the very first import and old posts never do
        if (!firstRun && ins && x.date > n - FRESH && (await getSet("news_notify", "1")) === "1") { await notifyNewsItem(num(ins.id), x.title, x.body); pushed++; }
      } else if (ex.source === "import" && (ex.title_en !== tEn || ex.body_en !== bEn || ex.link !== x.link)) {
        await run(`UPDATE hd_news SET title=CASE WHEN tr_edited = 0 THEN $6 ELSE title END, body=CASE WHEN tr_edited = 0 THEN $7 ELSE body END, title_en=$1, body_en=$2, link=$3, updated_at=$4 WHERE id=$5`, [tEn, bEn, x.link, n, ex.id, x.title, x.body]); upd++;
      }
    }
    await putSet("news_first_done", "1");
    await putSet("news_sync_stats", JSON.stringify([add, upd, pushed, items.length]));
    msg = `تمت المزامنة: ${items.length} خبر في المصدر · جديد ${add} · محدَّث ${upd}` + (pushed ? ` · إشعارات ${pushed}` : "") + (skipped ? ` · تخطّي ${skipped} (بلا تاريخ نشر واضح)` : "") + note; good = "1";
    if (add || upd) await putSet("news_sync_at", String(n));
  } catch (e: any) { msg = "فشلت المزامنة: " + String(e?.message ?? e).slice(0, 200); }
  await putSet("news_sync_ok", good); await putSet("news_sync_try", String(nowS())); await putSet("news_sync_msg", msg);
  return msg;
}
// one-time: stop old imported news (older than the display window) so the app shows only recent items
setTimeout(async () => { try { if ((await getSet("news_old_off")) !== "1") { await run(`UPDATE hd_news SET active = 0 WHERE source = 'import' AND pinned = 0 AND published_at < $1`, [nowS() - (await maxDays()) * 86400]); await putSet("news_old_off", "1"); } } catch {} }, 5000);


// ---------- AI-prepared weekly drafts (needs ANTHROPIC_API_KEY; drafts stay hidden until an admin approves them) ----------
export async function draftEvents(): Promise<string> {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return "أضف مفتاح ANTHROPIC_API_KEY في إعدادات الخادم أولًا";
  const n = nowS();
  let msg = "", good = "0";
  try {
    const model = (await getSet("ev_ai_model")) || "claude-sonnet-5-5";
    const today = new Date(n * 1000).toISOString().slice(0, 10);
    const prompt = `Today is ${today} (UTC). Search the web for the official Hay Day (Supercell) event schedule for the CURRENT and NEXT week (truck/ship/town bonuses, 2x XP, derby, valley, fishing, seasonal events). Use only information you actually find; never guess dates. Reply with ONLY a JSON array (no prose, no code fence). Each item: {"name":"Arabic name","name_en":"English name","kind":"truck|boat|town|xp2|derby|valley|fishing|seasonal|other","start":"ISO-8601 UTC","end":"ISO-8601 UTC","rewards":"Arabic short text or empty"}. Hay Day events normally start at 08:00 UTC. If you find nothing reliable reply [].`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model, max_tokens: 3000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }], messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error("API " + r.status);
    const j: any = await r.json();
    const text = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    const m = text.match(/\[[\s\S]*\]/);
    const arr: any[] = m ? JSON.parse(m[0]) : [];
    let add = 0;
    for (const x of arr.slice(0, 60)) {
      const name = String(x.name ?? x.name_en ?? "").trim().slice(0, 120), s = toSec(x.start), e = toSec(x.end);
      const kind = KIND_OK.has(String(x.kind)) ? String(x.kind) : guessKind(name + " " + String(x.name_en ?? ""));
      if (!name || !s || !e || e <= s || e - s > 14 * 86400 || e < n - 86400 || s > n + 21 * 86400) continue;
      if (await first(`SELECT id FROM hd_events WHERE start_at = $1 AND (name = $2 OR kind = $3)`, [s, name, kind])) continue;
      await run(`INSERT INTO hd_events (name, name_en, kind, start_at, end_at, rewards, source, ext_id, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,0,$8,$8)`, [name, String(x.name_en ?? "").slice(0, 120), kind, s, e, String(x.rewards ?? "").slice(0, 400), `ai|${name}|${s}`, n]); add++;
    }
    msg = add ? `تم تجهيز ${add} مسودة بانتظار مراجعتك` : "لم يجد البحث أحداثًا موثوقة جديدة";
    good = "1";
  } catch (e: any) { msg = "فشل تجهيز المسودات: " + String(e?.message ?? e).slice(0, 120); }
  await putSet("ev_ai_ok", good); await putSet("ev_ai_try", String(nowS())); await putSet("ev_ai_msg", msg);
  return msg;
}
const weekKey = (n: number) => { const d = new Date(n * 1000), mon = Math.floor(n / 86400) - ((d.getUTCDay() + 6) % 7); return String(mon); };

// hourly background sync when a source is configured (and cleanup of long-ended imported events)
setInterval(async () => {
  try {
    if ((await getSet("ev_auto", "1")) === "1" && /^https:\/\//.test((await getSet("ev_src_url")).trim())) await syncEvents();
    if ((await getSet("ev_ai_auto", "0")) === "1" && env("ANTHROPIC_API_KEY")) {
      const n = nowS(), d = new Date(n * 1000), due = d.getUTCDay() === 0 ? d.getUTCHours() >= 13 : d.getUTCDay() === 1 || d.getUTCDay() === 2;
      const wk = weekKey(d.getUTCDay() === 0 ? n + 86400 : n); // Sunday afternoon prepares the coming week
      if (due && (await getSet("ev_ai_week")) !== wk && n - num(await getSet("ev_ai_try", "0")) > 3000) { await draftEvents(); if ((await getSet("ev_ai_ok")) === "1") await putSet("ev_ai_week", wk); }
    }
    await run(`DELETE FROM hd_events WHERE end_at < $1 AND source = 'import'`, [nowS() - 30 * 86400]);
  } catch (e) { console.error("events sync", e); }
}, 3600_000);
setInterval(async () => { try { if ((await getSet("news_auto", "1")) === "1") await syncNews(); } catch (e) { console.error("news sync", e); } }, 20 * 60_000);
setTimeout(async () => { try { if ((await getSet("news_auto", "1")) === "1") await syncNews(); } catch (e) { console.error("news first sync", e); } }, 25000);

// ---------- admin ----------
const parseUtc = (v: string) => { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 1000) : 0; };
const fmtU = (n: any) => (num(n) ? new Date(num(n) * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");
const toInp = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);

export async function evAct(act: string, f: (k: string) => string, id: number): Promise<string> {
  const t = nowS(), img = f("image");
  switch (act) {
    case "ev_save": {
      const name = f("name").trim().slice(0, 120), kind = KIND_OK.has(f("kind")) ? f("kind") : "other";
      const s = parseUtc(f("start")), e = parseUtc(f("end"));
      if (!name) return "اسم الحدث مطلوب";
      if (!s || !e) return "أدخل وقت البداية والنهاية";
      if (e <= s) return "وقت النهاية يجب أن يكون بعد البداية";
      if (e - s > MAX_LEN) return "مدة الحدث أطول من المسموح (60 يومًا)";
      const v = [name, f("name_en").trim().slice(0, 120), kind, s, e, f("rewards").trim().slice(0, 400), f("rewards_en").trim().slice(0, 400), f("active") === "1" ? 1 : 0];
      if (id > 0) {
        await run(`UPDATE hd_events SET name=$1, name_en=$2, kind=$3, start_at=$4, end_at=$5, rewards=$6, rewards_en=$7, active=$8, source=CASE WHEN source='draft' THEN 'draft' ELSE 'manual' END, updated_at=$9 WHERE id=$10`, [...v, t, id]);
        if (img && okImg(img)) await run(`UPDATE hd_events SET image=$1 WHERE id=$2`, [img, id]);
        if (f("noimg") === "1") await run(`UPDATE hd_events SET image=NULL WHERE id=$1`, [id]);
        return "تم حفظ الحدث";
      }
      const ins = (await run(`INSERT INTO hd_events (name, name_en, kind, start_at, end_at, rewards, rewards_en, active, image, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10,$10) RETURNING id`, [...v, img || null, t]))[0];
      if (ins && v[7] === 1 && e > t && (await getSet("ev_notify", "0")) === "1") { await notifyEventItem(num(ins.id), name, f("rewards").trim()); return "تمت إضافة الحدث وإرسال إشعار به"; }
      return "تمت إضافة الحدث";
    }
    case "ev_toggle": { const r = await first(`SELECT active FROM hd_events WHERE id = $1`, [id]); if (!r) return "الحدث غير موجود"; await run(`UPDATE hd_events SET active = $1, updated_at = $2 WHERE id = $3`, [num(r.active) ? 0 : 1, t, id]); return num(r.active) ? "تم إيقاف الحدث" : "تم تفعيل الحدث"; }
    case "ev_pin": { const r = await first(`SELECT pinned FROM hd_events WHERE id = $1`, [id]); if (!r) return "الحدث غير موجود"; await run(`UPDATE hd_events SET pinned = $1, updated_at = $2 WHERE id = $3`, [num(r.pinned) ? 0 : 1, t, id]); return num(r.pinned) ? "أُلغي التثبيت" : "تم تثبيت الحدث"; }
    case "ev_notify": {
      const r = await first(`SELECT name, rewards, active FROM hd_events WHERE id = $1`, [id]); if (!r) return "الحدث غير موجود";
      if (!num(r.active)) return "الحدث موقوف؛ فعّله أولًا";
      if (await first(`SELECT id FROM notifications WHERE ref = $1 AND created_at > $2`, ["EV-" + id, t - 300])) return "أُرسل إشعار لهذا الحدث قبل لحظات";
      const n = await notifyEventItem(id, r.name, r.rewards); return `تم إرسال الإشعار إلى ${n} مستخدم (داخل التطبيق + إشعار الجهاز لمن فعّله)`;
    }
    case "ev_notify_set": await putSet("ev_notify", f("on") === "1" ? "1" : "0"); return "تم حفظ إعداد الإشعار التلقائي";
    case "ev_del": await run(`DELETE FROM hd_events WHERE id = $1`, [id]); return "تم حذف الحدث";
    case "ev_clone_week": {
      // copy events that started in the last 7 days to the same time next week (skips ones already present)
      const src = await run(`SELECT * FROM hd_events WHERE active = 1 AND start_at >= $1 AND start_at < $2`, [t - 7 * 86400, t]);
      let n = 0;
      for (const e of src) {
        const s2 = num(e.start_at) + 7 * 86400, e2 = num(e.end_at) + 7 * 86400;
        if (await first(`SELECT id FROM hd_events WHERE name = $1 AND start_at = $2`, [e.name, s2])) continue;
        await run(`INSERT INTO hd_events (name, name_en, kind, image, start_at, end_at, rewards, rewards_en, source, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',1,$9,$9)`, [e.name, e.name_en, e.kind, e.image, s2, e2, e.rewards, e.rewards_en, t]); n++;
      }
      return n ? `تم نسخ ${n} حدث إلى الأسبوع القادم` : "لا توجد أحداث جديدة للنسخ";
    }
    case "ev_clear_ended": await run(`DELETE FROM hd_events WHERE end_at < $1`, [t]); return "تم حذف الأحداث المنتهية";
    case "rule_save": {
      const name = f("name").trim().slice(0, 120), kind = KIND_OK.has(f("kind")) ? f("kind") : "other";
      const wd = Number(f("weekday")), hr = Number(f("hour")), mi = Number(f("minute") || 0), du = Number(f("duration_h"));
      if (!name) return "اسم الحدث مطلوب";
      if (!(wd >= 0 && wd <= 6) || !(hr >= 0 && hr <= 23) || !(mi >= 0 && mi <= 59) || !(du >= 1 && du <= 24 * 14)) return "قيم الجدولة غير صالحة";
      const v = [name, f("name_en").trim().slice(0, 120), kind, wd, hr, mi, du, f("rewards").trim().slice(0, 400), f("rewards_en").trim().slice(0, 400), f("active") === "1" ? 1 : 0];
      if (id > 0) { await run(`UPDATE hd_event_rules SET name=$1, name_en=$2, kind=$3, weekday=$4, hour=$5, minute=$6, duration_h=$7, rewards=$8, rewards_en=$9, active=$10, updated_at=$11 WHERE id=$12`, [...v, t, id]); return "تم حفظ القاعدة"; }
      await run(`INSERT INTO hd_event_rules (name, name_en, kind, weekday, hour, minute, duration_h, rewards, rewards_en, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`, [...v, t]);
      return "تمت إضافة قاعدة التكرار الأسبوعي";
    }
    case "rule_del": await run(`DELETE FROM hd_event_rules WHERE id = $1`, [id]); return "تم حذف القاعدة";
    case "ev_src": {
      const u = f("url").trim();
      if (u && !/^https:\/\/[^\s]{4,480}$/.test(u)) return "الرابط يجب أن يبدأ بـ https://";
      await putSet("ev_src_url", u); await putSet("ev_auto", f("auto") === "1" ? "1" : "0");
      return u ? "تم حفظ مصدر الاستيراد" : "تم مسح مصدر الاستيراد";
    }
    case "ev_sync": return syncEvents();
    case "ev_draft_run": return draftEvents();
    case "ev_ai_set": await putSet("ev_ai_auto", f("auto") === "1" ? "1" : "0"); await putSet("ev_ai_model", f("model").trim().slice(0, 80)); return "تم حفظ إعدادات التجهيز الأسبوعي";
    case "ev_draft_ok": await run(`UPDATE hd_events SET active = 1, source = 'manual', updated_at = $1 WHERE id = $2 AND source = 'draft'`, [t, id]); return "تم اعتماد الحدث ونشره في التطبيق";
    case "ev_draft_okall": { const n = await count(`SELECT COUNT(*) c FROM hd_events WHERE source = 'draft'`); await run(`UPDATE hd_events SET active = 1, source = 'manual', updated_at = $1 WHERE source = 'draft'`, [t]); return `تم اعتماد ${n} حدث`; }
    case "ev_draft_clear": await run(`DELETE FROM hd_events WHERE source = 'draft'`); return "تم حذف كل المسودات";
    case "news_save": {
      const title = f("title").trim().slice(0, 200), cat = CAT_OK.has(f("cat")) ? f("cat") : "news", link = f("link").trim();
      if (!title) return "عنوان الخبر مطلوب";
      if (link && !/^https:\/\/[^\s]{4,580}$/.test(link)) return "رابط الخبر يجب أن يبدأ بـ https://";
      const d = parseUtc(f("date")) || t;
      const v = [title, f("title_en").trim().slice(0, 200), f("body").trim().slice(0, 4000), f("body_en").trim().slice(0, 4000), cat, link, f("pinned") === "1" ? 1 : 0, d, f("active") === "1" ? 1 : 0];
      if (id > 0) {
        const old = await first(`SELECT title, body, source FROM hd_news WHERE id = $1`, [id]);
        const edited = old?.source === "import" && (old.title !== title || old.body !== f("body").trim().slice(0, 4000)) ? 1 : 0;
        await run(`UPDATE hd_news SET title=$1, title_en=$2, body=$3, body_en=$4, cat=$5, link=$6, pinned=$7, published_at=$8, active=$9, updated_at=$10, tr_edited = CASE WHEN $12 = 1 THEN 1 ELSE tr_edited END WHERE id=$11`, [...v, t, id, edited]);
        if (img && okImg(img)) await run(`UPDATE hd_news SET image=$1 WHERE id=$2`, [img, id]);
        if (f("noimg") === "1") await run(`UPDATE hd_news SET image=NULL WHERE id=$1`, [id]);
        return "تم حفظ الخبر";
      }
      await run(`INSERT INTO hd_news (title, title_en, body, body_en, cat, link, pinned, published_at, active, image, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual',$11,$11)`, [...v, img || null, t]);
      return "تم نشر الخبر";
    }
    case "news_del": {
      const n = await first(`SELECT source FROM hd_news WHERE id = $1`, [id]);
      if (n?.source === "import") { await run(`UPDATE hd_news SET active = 0, updated_at = $1 WHERE id = $2`, [t, id]); return "تم إخفاء الخبر المستورد"; }
      await run(`DELETE FROM hd_news WHERE id = $1`, [id]); return "تم حذف الخبر";
    }
    case "news_src": {
      const u = f("url").trim();
      if (u && !/^https:\/\/[^\s]{4,480}$/.test(u)) return "الرابط يجب أن يبدأ بـ https://";
      await putSet("news_src_url", u); await putSet("news_auto", f("auto") === "1" ? "1" : "0"); await putSet("news_note", f("note").trim().slice(0, 200)); if (f("days")) await putSet("news_max_days", String(Math.min(3650, Math.max(1, Number(f("days")) || 60))));
      return "تم حفظ إعدادات الأخبار";
    }
    case "news_sync": return syncNews();
    case "news_toggle": { const r = await first(`SELECT active FROM hd_news WHERE id = $1`, [id]); if (!r) return "الخبر غير موجود"; await run(`UPDATE hd_news SET active = $1, updated_at = $2 WHERE id = $3`, [num(r.active) ? 0 : 1, t, id]); return num(r.active) ? "تم إخفاء الخبر" : "تم إظهار الخبر"; }
    case "news_pin": { const r = await first(`SELECT pinned FROM hd_news WHERE id = $1`, [id]); if (!r) return "الخبر غير موجود"; await run(`UPDATE hd_news SET pinned = $1, updated_at = $2 WHERE id = $3`, [num(r.pinned) ? 0 : 1, t, id]); return num(r.pinned) ? "أُلغي التثبيت" : "تم تثبيت الخبر"; }
    case "news_notify": {
      const r = await first(`SELECT title, body, active FROM hd_news WHERE id = $1`, [id]); if (!r) return "الخبر غير موجود";
      if (!num(r.active)) return "الخبر مخفي؛ أظهره أولًا";
      if (await first(`SELECT id FROM notifications WHERE ref = $1 AND created_at > $2`, ["NEWS-" + id, t - 300])) return "أُرسل إشعار لهذا الخبر قبل لحظات";
      const n = await notifyNewsItem(id, r.title, r.body); return `تم إرسال الإشعار إلى ${n} مستخدم (داخل التطبيق + إشعار الجهاز لمن فعّله)`;
    }
    case "news_notify_set": await putSet("news_notify", f("on") === "1" ? "1" : "0"); await putSet("news_max_days", String(Math.min(3650, Math.max(1, Number(f("days")) || 60)))); return "تم حفظ إعداد الإشعار التلقائي";
  }
  return "إجراء غير معروف";
}

export async function eventsPage(ctx: Ctx): Promise<{ title: string; body: string; js?: string }> {
  const { t, F, hid, url: pu } = ctx;
  const n = nowS();
  const kindSel = (cur: string) => `<select class="w" name="kind">${KINDS.map(([k, a]) => `<option value="${k}"${k === cur ? " selected" : ""}>${h(t(a))}</option>`).join("")}</select>`;
  const dt = (name: string, v: number) => `<input type="datetime-local" class="w" name="${name}" value="${v ? toInp(v) : ""}" required>`;
  const chk = (name: string, label: string, on: boolean, auto = false) => `<label class="row" style="gap:6px"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}${auto ? ` onchange="this.form.submit()"` : ""}> ${h(label)}</label>`;
  const evForm = (e?: Row) => F("ev_save", `${e ? hid("id", e.id) : ""}
    <div class="fg">${field(t("اسم الحدث (عربي)"), `<input type="text" class="w" name="name" maxlength="120" value="${h(e?.name ?? "")}" required>`)}${field(t("الاسم بالإنجليزية"), `<input type="text" class="w" name="name_en" maxlength="120" value="${h(e?.name_en ?? "")}">`)}
    ${field(t("النوع"), kindSel(e?.kind ?? "other"))}${field(t("البداية (توقيت اللعبة UTC)"), dt("start", num(e?.start_at)))}${field(t("النهاية (توقيت اللعبة UTC)"), dt("end", num(e?.end_at)))}
    ${field(t("المكافآت (عربي)"), `<input type="text" class="w" name="rewards" maxlength="400" value="${h(e?.rewards ?? "")}">`)}${field(t("المكافآت بالإنجليزية"), `<input type="text" class="w" name="rewards_en" maxlength="400" value="${h(e?.rewards_en ?? "")}">`)}</div>
    <div class="row" style="margin-top:10px">${chk("active", t("ظاهر في التطبيق"), e ? !!num(e.active) : true)}${picker(e ? imgUrl("e", e) : null)}${e ? chk("noimg", t("إزالة الصورة المخصصة"), false) : ""}<button class="${e ? "" : "y"}">${h(t(e ? "حفظ" : "إضافة الحدث"))}</button></div>`);
  const rows = await run(`SELECT e.id, e.name, e.name_en, e.kind, e.rewards, e.rewards_en, e.start_at, e.end_at, e.active, e.source, e.pinned, ${IMG("image", "e.")} FROM hd_events e ORDER BY e.pinned DESC, e.start_at DESC, e.id DESC LIMIT 200`);
  const rules = await run(`SELECT * FROM hd_event_rules ORDER BY weekday, hour, id`);
  const ruleForm = (r?: Row) => F("rule_save", `${r ? hid("id", r.id) : ""}
    <div class="fg">${field(t("اسم الحدث (عربي)"), `<input type="text" class="w" name="name" maxlength="120" value="${h(r?.name ?? "")}" required>`)}${field(t("الاسم بالإنجليزية"), `<input type="text" class="w" name="name_en" maxlength="120" value="${h(r?.name_en ?? "")}">`)}
    ${field(t("النوع"), kindSel(r?.kind ?? "other"))}
    ${field(t("يوم البداية (UTC)"), `<select class="w" name="weekday">${DAYS.map((d, i) => `<option value="${i}"${i === num(r?.weekday ?? 1) ? " selected" : ""}>${h(t(d))}</option>`).join("")}</select>`)}
    ${field(t("الساعة (UTC)"), `<input type="number" class="w" name="hour" min="0" max="23" value="${num(r?.hour ?? 8)}" required>`)}${field(t("الدقيقة"), `<input type="number" class="w" name="minute" min="0" max="59" value="${num(r?.minute)}">`)}
    ${field(t("المدة بالساعات"), `<input type="number" class="w" name="duration_h" min="1" max="336" value="${num(r?.duration_h ?? 24)}" required>`)}
    ${field(t("المكافآت (عربي)"), `<input type="text" class="w" name="rewards" maxlength="400" value="${h(r?.rewards ?? "")}">`)}${field(t("المكافآت بالإنجليزية"), `<input type="text" class="w" name="rewards_en" maxlength="400" value="${h(r?.rewards_en ?? "")}">`)}</div>
    <div class="row" style="margin-top:10px">${chk("active", t("مفعّلة"), r ? !!num(r.active) : true)}<button class="${r ? "" : "y"}">${h(t(r ? "حفظ" : "إضافة قاعدة"))}</button></div>`);
  const src = await getSet("ev_src_url"), auto = (await getSet("ev_auto", "1")) === "1", tryAt = num(await getSet("ev_sync_try", "0")), msg = await getSet("ev_sync_msg"), syncOk = (await getSet("ev_sync_ok")) === "1", evNotify = (await getSet("ev_notify", "1")) === "1";
  let st: number[] = [0, 0, 0]; try { st = JSON.parse(await getSet("ev_sync_stats", "[0,0,0]")); } catch {}
  const drafts = rows.filter((e) => e.source === "draft");
  const aiKey = !!env("ANTHROPIC_API_KEY"), aiAuto = (await getSet("ev_ai_auto", "0")) === "1", aiTry = num(await getSet("ev_ai_try", "0")), aiOk = (await getSet("ev_ai_ok")) === "1", aiMsg = await getSet("ev_ai_msg");
  const sent = new Set((await run(`SELECT DISTINCT ref FROM notifications WHERE ref LIKE 'EV-%'`)).map((r) => String(r.ref)));
  const f = ["on", "off"].includes(pu.searchParams.get("f") ?? "") ? pu.searchParams.get("f")! : "all";
  const nOn = rows.filter((r) => num(r.active)).length, nOff = rows.length - nOn;
  const shown = rows.filter((r) => f === "all" || (f === "on" ? num(r.active) : !num(r.active)));
  const tile = (lab: string, val: string) => `<div style="flex:1;min-width:0;background:#f5f8fc;border-radius:14px;padding:10px 10px"><div class="sm">${h(lab)}</div><div style="font-weight:900;font-size:14px;margin-top:4px;line-height:1.4">${val}</div></div>`;
  const when = tryAt ? (() => { const d = new Date((tryAt + 3 * 3600) * 1000), H = d.getUTCHours(); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}، ${H % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${H < 12 ? "ص" : "م"}`; })() : "—";
  const dfmt = (v: any) => { const d = new Date(num(v) * 1000); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const tog = (id: string) => `onclick="var d=document.getElementById('${id}');d.open=!d.open"`;
  const draftBox = `<div class="box"><h2>${h(t("تجهيز أحداث الأسبوع تلقائيًا (مسودات للمراجعة)"))}</h2>
    <p class="hint">${h(t("يبحث الذكاء الاصطناعي في الإنترنت عن جدول أحداث الأسبوع ويحفظ ما يجده كمسودات مخفية. لا يظهر شيء للمستخدمين حتى تعتمده أنت. قد يخطئ أو لا يجد شيئًا، لذلك راجع الأوقات قبل الاعتماد."))}${aiKey ? "" : " — " + h(t("يتطلب إضافة مفتاح ANTHROPIC_API_KEY في إعدادات الخادم"))}</p>
    ${F("ev_ai_set", `<div class="row">${chk("auto", t("تجهيز تلقائي كل أحد بعد 13:00 UTC"), aiAuto)}<input type="text" class="w mono" name="model" value="${h(await getSet("ev_ai_model"))}" placeholder="claude-sonnet-5-5" style="max-width:240px"><button>${h(t("حفظ"))}</button></div>`)}
    ${F("ev_draft_run", `<div class="row" style="margin-top:8px"><button class="g">${h(t("تجهيز مسودات الآن"))}</button>${aiTry ? `<span class="sm">${statusChip(aiOk ? "ok" : "bad", aiOk ? t("ناجح") : t("فشل"))} ${fmtT(aiTry)} · ${h(t(aiMsg))}</span>` : ""}</div>`)}
    ${drafts.length ? `<h2 style="margin-top:14px">${h(t("مسودات بانتظار المراجعة"))} (${drafts.length})</h2>` + drafts.map((e) => `<div class="item"><div class="row"><b>${h(e.name)}</b>${statusChip("processing", t(KINDS.find((x) => x[0] === e.kind)?.[1] ?? ""))}<span class="sm">${fmtU(e.start_at)} → ${fmtU(e.end_at)}</span></div>${e.rewards ? `<div class="sm">${h(e.rewards)}</div>` : ""}
      <details><summary>${h(t("تعديل قبل الاعتماد"))}</summary>${evForm(e)}</details><div class="acts">${F("ev_draft_ok", `${hid("id", e.id)}<button class="y s">${h(t("اعتماد ونشر"))}</button>`)}${F("ev_del", `${hid("id", e.id)}<button class="r s">${h(t("حذف"))}</button>`)}</div></div>`).join("") + `<div class="acts">${F("ev_draft_okall", `<button class="y s" onclick="return confirm('${h(t("اعتماد كل المسودات ونشرها؟"))}')">${h(t("اعتماد الكل"))}</button>`)}${F("ev_draft_clear", `<button class="r s" onclick="return confirm('${h(t("حذف كل المسودات؟"))}')">${h(t("حذف كل المسودات"))}</button>`)}</div>` : ""}</div>`;
  const rulesBox = `<div class="box"><h2>${h(t("جدول أسبوعي متكرر"))}</h2><p class="hint">${h(t("لأحداث تتكرر كل أسبوع في نفس اليوم والساعة (مثلًا يوم الاثنين 08:00 UTC لمدة 24 ساعة). يولّدها الخادم تلقائيًا للأسابيع القادمة دون إعادة إدخالها."))}</p>${ruleForm()}</div>` +
    (rules.length ? `<h2>${h(t("القواعد المتكررة"))}</h2>` + rules.map((r) => `<div class="item"><div class="row"><b>${h(r.name)}</b>${statusChip(num(r.active) ? "ok" : "bad", num(r.active) ? t("مفعّلة") : t("متوقفة"))}<span class="sm">${h(t(DAYS[num(r.weekday)]))} ${String(num(r.hour)).padStart(2, "0")}:${String(num(r.minute)).padStart(2, "0")} UTC · ${num(r.duration_h)}${h(t("س"))}</span></div>
    <details><summary>${h(t("تعديل"))}</summary>${ruleForm(r)}</details><div class="acts">${F("rule_del", `${hid("id", r.id)}<button class="r s" onclick="return confirm('${h(t("حذف القاعدة؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`).join("") : "");
  const body = `<div style="background:linear-gradient(135deg,#0d3b24,#14532d);color:#fff;border-radius:22px;padding:18px 20px;margin-bottom:16px"><h2 style="margin:0 0 6px;color:#fff">🌾 ${h(t("أحداث Hay Day"))}</h2>
    <div style="opacity:.9;line-height:1.7">${h(t("تظهر في التطبيق فورًا، ويُحسب حالها (جارٍ / قادم / منتهٍ) تلقائيًا بتوقيت اللعبة UTC."))}</div>${src ? `<div class="mono" style="opacity:.7;margin-top:4px;font-size:13px;direction:ltr;text-align:start">${h(src)}</div>` : ""}</div>
    <div class="box"><div class="row" style="gap:10px">${tile(t("آخر مزامنة"), tryAt ? h(when) : "—")}${tile(t("الحالة"), tryAt ? (syncOk ? `<span style="color:#1b8a4b">✅ ${h(t("ناجحة"))}</span>` : `<span style="color:#c62828">❌ ${h(t("فشلت"))}</span>`) : "—")}${tile(t("عدد الأحداث"), String(rows.length))}</div>
    <p class="sm" style="margin:12px 0 4px">${h(t("آخر مزامنة"))}: ${h(t("جديد"))} ${st[0]}، ${h(t("محدّث"))} ${st[1]}، ${h(t("إشعارات"))} ${st[2]}${!syncOk && msg ? ` — ${h(t(msg))}` : ""}</p>
    ${F("ev_notify_set", `<div class="row" style="margin:6px 0">${chk("on", "🔔 " + t("إرسال إشعار تلقائي عند نزول حدث جديد"), evNotify, true)}</div>`)}
    <div class="row" style="margin-top:10px;gap:10px"><div style="flex:1;min-width:150px">${F("ev_sync", `<button class="g" style="width:100%;background:#22b35a;color:#fff;padding:16px;font-size:17px;border-radius:16px">↻ ${h(t("مزامنة الآن"))}</button>`)}</div>
    <button type="button" ${tog("addev")} style="flex:1;min-width:150px;background:#111;color:#f5c542;padding:16px;font-size:17px;border-radius:16px">➕ ${h(t("إضافة حدث يدويًا"))}</button></div>
    <details id="addev" style="margin-top:12px"><summary style="display:none"></summary>${evForm()}</details>
    <details style="margin-top:12px"><summary class="sm" style="cursor:pointer">⚙️ ${h(t("إعدادات المصدر"))}</summary>
    <p class="hint">${h(t("لا يوجد API رسمي من Supercell لأحداث Hay Day. إن توفر لديك مصدر موثوق (رابط JSON أو تقويم iCal) ضع رابطه هنا وسيتزامن الخادم معه كل ساعة."))}</p>
    ${F("ev_src", `<div class="row"><input type="url" class="w" name="url" placeholder="https://..." value="${h(src)}" style="min-width:260px;flex:1">${chk("auto", t("مزامنة تلقائية كل ساعة"), auto)}<button>${h(t("حفظ المصدر"))}</button></div>`)}
    <div class="acts">${F("ev_clone_week", `<button class="g s" onclick="return confirm('${h(t("نسخ أحداث آخر 7 أيام إلى الأسبوع القادم؟"))}')">${h(t("نسخ أحداث الأسبوع الماضي للأسبوع القادم"))}</button>`)}${F("ev_clear_ended", `<button class="g s" onclick="return confirm('${h(t("حذف كل الأحداث المنتهية؟"))}')">${h(t("حذف المنتهية"))}</button>`)}</div>
    ${draftBox}${rulesBox}</details></div>
    <div class="box"><div class="tabs">${([["all", "الكل", rows.length], ["on", "الظاهرة للعملاء", nOn], ["off", "الموقوفة", nOff]] as [string, string, number][]).map(([k, l, c]) => `<a href="/admin?tab=events&f=${k}" class="${f === k ? "on" : ""}">${k === "on" ? "✅ " : k === "off" ? "⛔ " : ""}${h(t(l))} (${c})</a>`).join("")}</div>
    ${shown.filter((e) => e.source !== "draft").map((e) => { const off = !num(e.active), s = status(num(e.start_at), num(e.end_at), n), k = KINDS.find((x) => x[0] === e.kind); return `<div class="item" style="${off ? "opacity:.75" : ""}"><div class="hd"><img class="th" style="width:76px;height:56px;border-radius:10px" src="${h(imgUrl("e", e) ?? defImg(e.kind))}" alt=""><div>
      <div style="font-weight:800;font-size:16px;line-height:1.6${off ? ";text-decoration:line-through" : ""}">${h(e.name)}</div><div class="sm">${h(t(k?.[1] ?? ""))} · ${dfmt(e.start_at)}</div>
      <div class="row" style="margin-top:8px">${e.source === "import" ? statusChip("ok", "✅ " + t("رسمي")) : statusChip("processing", t("يدوي"))}${statusChip(s === "running" ? "ok" : s === "upcoming" ? "processing" : "cancelled", t(s === "running" ? "جارٍ الآن" : s === "upcoming" ? "قادم" : "منتهٍ"))}${num(e.pinned) ? statusChip("new", "📌 " + t("مثبّت")) : ""}${sent.has("EV-" + e.id) ? statusChip("processing", "🔔 " + t("أُرسل إشعار")) : ""}${off ? statusChip("bad", "⛔ " + t("موقوف")) : ""}</div></div></div>
      <div class="acts">${F("ev_toggle", `${hid("id", e.id)}<button class="g s">${off ? "✅ " + h(t("تفعيل")) : "⛔ " + h(t("إيقاف"))}</button>`)}${F("ev_pin", `${hid("id", e.id)}<button class="g s">${num(e.pinned) ? h(t("إلغاء التثبيت")) : "📌 " + h(t("تثبيت"))}</button>`)}${F("ev_notify", `${hid("id", e.id)}<button class="g s" onclick="return confirm('${h(t("إرسال إشعار بهذا الحدث لجميع المستخدمين؟"))}')">🔔 ${h(t("إشعار"))}</button>`)}<button type="button" class="g s" ${tog("evt" + e.id)}>✏️ ${h(t("الترجمة"))}</button></div>
      <details id="evt${e.id}" style="margin-top:8px"><summary style="display:none"></summary>${evForm(e)}<div class="acts">${F("ev_del", `${hid("id", e.id)}<button class="r s" onclick="return confirm('${h(t("حذف الحدث؟"))}')">🗑 ${h(t("حذف"))}</button>`)}</div></details></div>`; }).join("") || `<p class="hint">${h(t("لا توجد أحداث."))}</p>`}</div>`;
  return { title: "📅 " + t("أحداث Hay Day"), body, js: PICK_JS };
}

export async function newsPage(ctx: Ctx): Promise<{ title: string; body: string; js?: string }> {
  const { t, F, hid, url: pu } = ctx;
  const chk = (name: string, label: string, on: boolean, auto = false) => `<label class="row" style="gap:6px"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}${auto ? ` onchange="this.form.submit()"` : ""}> ${h(label)}</label>`;
  const catSel = (cur: string) => `<select class="w" name="cat">${NCATS.map(([k, a]) => `<option value="${k}"${k === cur ? " selected" : ""}>${h(t(a))}</option>`).join("")}</select>`;
  const form = (n?: Row) => F("news_save", `${n ? hid("id", n.id) : ""}<div class="fg">
    ${field(t("العنوان (عربي)"), `<input type="text" class="w" name="title" maxlength="200" value="${h(n?.title ?? "")}" required>`)}${field(t("العنوان بالإنجليزية"), `<input type="text" class="w" name="title_en" maxlength="200" value="${h(n?.title_en ?? "")}">`)}
    ${field(t("التصنيف"), catSel(n?.cat ?? "events"))}${field(t("تاريخ النشر (UTC)"), `<input type="datetime-local" class="w" name="date" value="${toInp(num(n?.published_at) || nowS())}">`)}
    ${field(t("رابط الخبر الكامل (اختياري)"), `<input type="url" class="w" name="link" placeholder="https://..." value="${h(n?.link ?? "")}">`)}</div>
    <p style="margin-top:10px">${field(t("نص الخبر (عربي)"), `<textarea name="body" maxlength="4000">${h(n?.body ?? "")}</textarea>`)}</p><p style="margin-top:6px">${field(t("نص الخبر بالإنجليزية"), `<textarea name="body_en" maxlength="4000">${h(n?.body_en ?? "")}</textarea>`)}</p>
    <div class="row" style="margin-top:10px">${chk("pinned", t("تثبيت في الأعلى"), !!num(n?.pinned))}${chk("active", t("ظاهر في التطبيق"), n ? !!num(n.active) : true)}${picker(n ? imgUrl("w", n) : null)}${n ? chk("noimg", t("إزالة الصورة"), false) : ""}<button class="${n ? "" : "y"}">${h(t(n ? "حفظ" : "نشر الخبر"))}</button></div>`);
  const rows = await run(`SELECT n.*, ${IMG("image", "n.")} FROM hd_news n ORDER BY n.pinned DESC, n.published_at DESC, n.id DESC LIMIT 200`);
  const sent = new Set((await run(`SELECT DISTINCT ref FROM notifications WHERE ref LIKE 'NEWS-%'`)).map((r) => String(r.ref)));
  const src = (await getSet("news_src_url")) || NEWS_DEFAULT_SRC, nNotify = (await getSet("news_notify", "1")) === "1", auto = (await getSet("news_auto", "1")) === "1", note = await getSet("news_note");
  const tryAt = num(await getSet("news_sync_try", "0")), ok1 = (await getSet("news_sync_ok")) === "1", msg = await getSet("news_sync_msg");
  let st: number[] = [0, 0, 0, 0]; try { st = JSON.parse(await getSet("news_sync_stats", "[0,0,0,0]")); } catch {}
  const f = ["on", "off"].includes(pu.searchParams.get("f") ?? "") ? pu.searchParams.get("f")! : "all";
  const nOn = rows.filter((r) => num(r.active)).length, nOff = rows.length - nOn;
  const shown = rows.filter((r) => f === "all" || (f === "on" ? num(r.active) : !num(r.active)));
  const tile = (lab: string, val: string) => `<div style="flex:1;min-width:0;background:#f5f8fc;border-radius:14px;padding:10px 10px"><div class="sm">${h(lab)}</div><div style="font-weight:900;font-size:14px;margin-top:4px;line-height:1.4">${val}</div></div>`;
  const when = tryAt ? (() => { const d = new Date((tryAt + 3 * 3600) * 1000), H = d.getUTCHours(); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}، ${H % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${H < 12 ? "ص" : "م"}`; })() : "—";
  const dfmt = (v: any) => { const d = new Date(num(v) * 1000); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const tog = (id: string) => `onclick="var d=document.getElementById('${id}');d.open=!d.open"`;
  const body = `<div style="background:linear-gradient(135deg,#0d3b24,#14532d);color:#fff;border-radius:22px;padding:18px 20px;margin-bottom:16px"><h2 style="margin:0 0 6px;color:#fff">🌾 ${h(t("أخبار Hay Day الرسمية"))}</h2>
    <div style="opacity:.9;line-height:1.7">${h(t("تُستورد تلقائياً كل 20 دقيقة من صندوق أخبار Hay Day الرسمي (Supercell) بالعربية والإنجليزية."))}</div><div class="mono" style="opacity:.7;margin-top:4px;font-size:13px;direction:ltr;text-align:start">${h(src)}</div></div>
    <div class="box"><div class="row" style="gap:10px">${tile(t("آخر مزامنة"), tryAt ? h(when) : "—")}${tile(t("الحالة"), tryAt ? (ok1 ? `<span style="color:#1b8a4b">✅ ${h(t("ناجحة"))}</span>` : `<span style="color:#c62828">❌ ${h(t("فشلت"))}</span>`) : "—")}${tile(t("عدد الأخبار"), String(rows.length))}</div>
    <p class="sm" style="margin:12px 0 4px">${h(t("آخر مزامنة"))}: ${h(t("جديد"))} ${st[0]}، ${h(t("محدّث"))} ${st[1]}، ${h(t("إشعارات"))} ${st[2]}${!ok1 && msg ? ` — ${h(msg)}` : ""}</p>
    ${F("news_notify_set", `<div class="row" style="margin:6px 0">${chk("on", "🔔 " + t("إرسال إشعار تلقائي عند نزول خبر جديد"), nNotify, true)}<input type="hidden" name="days" value="${num(await getSet("news_max_days", "60")) || 60}"></div>`)}
    <div class="row" style="margin-top:10px;gap:10px"><div style="flex:1;min-width:150px">${F("news_sync", `<button class="g" style="width:100%;background:#22b35a;color:#fff;padding:16px;font-size:17px;border-radius:16px">↻ ${h(t("مزامنة الآن"))}</button>`)}</div>
    <button type="button" ${tog("addnews")} style="flex:1;min-width:150px;background:#111;color:#f5c542;padding:16px;font-size:17px;border-radius:16px">➕ ${h(t("إضافة خبر يدويًا"))}</button></div>
    <details id="addnews" style="margin-top:12px"><summary style="display:none"></summary>${form()}</details>
    <details style="margin-top:12px"><summary class="sm" style="cursor:pointer">⚙️ ${h(t("إعدادات المصدر"))}</summary>
    ${F("news_src", `<div class="fg">${field(t("رابط المصدر (https) — اتركه فارغًا للمصدر الرسمي"), `<input type="url" class="w" name="url" placeholder="${h(NEWS_DEFAULT_SRC)}" value="${h((await getSet("news_src_url")) || "")}">`)}${field(t("النص أعلى الصفحة (اختياري)"), `<input type="text" class="w" name="note" maxlength="200" value="${h(note)}">`)}${field(t("عرض أخبار آخر (يوم) فقط"), `<input type="number" class="w" name="days" min="1" max="3650" value="${num(await getSet("news_max_days", "60")) || 60}">`)}</div><div class="row">${chk("auto", t("مزامنة تلقائية كل 20 دقيقة"), auto)}<button>${h(t("حفظ"))}</button></div>`)}</details></div>
    <div class="box"><div class="tabs">${([["all", "الكل", rows.length], ["on", "الظاهرة للعملاء", nOn], ["off", "الموقوفة", nOff]] as [string, string, number][]).map(([k, l, c]) => `<a href="/admin?tab=news&f=${k}" class="${f === k ? "on" : ""}">${k === "on" ? "✅ " : k === "off" ? "⛔ " : ""}${h(t(l))} (${c})</a>`).join("")}</div>
    ${shown.map((n) => { const off = !num(n.active), ref = "NEWS-" + n.id, img = imgUrl("w", n); return `<div class="item" style="${off ? "opacity:.75" : ""}"><div class="hd">${img ? `<img class="th" style="width:76px;height:56px;border-radius:10px" src="${h(img)}" alt="">` : `<div class="th" style="width:76px;height:56px;border-radius:10px;display:grid;place-items:center">🌾</div>`}<div>
      <div style="font-weight:800;font-size:16px;line-height:1.6${off ? ";text-decoration:line-through" : ""}">${h(n.title)}</div><div class="sm">${h(t(NCATS.find((c) => c[0] === n.cat)?.[1] ?? ""))} · ${dfmt(n.published_at)}</div>
      <div class="row" style="margin-top:8px">${n.source === "import" ? statusChip("ok", "✅ " + t("رسمي")) : statusChip("processing", t("يدوي"))}${num(n.pinned) ? statusChip("new", "📌 " + t("مثبّت")) : ""}${sent.has(ref) ? statusChip("processing", "🔔 " + t("أُرسل إشعار")) : ""}${num(n.tr_edited) ? statusChip("under_review", "🈯 " + t("ترجمة معدّلة")) : ""}${off ? statusChip("bad", "⛔ " + t("موقوف")) : ""}</div></div></div>
      <div class="acts">${F("news_toggle", `${hid("id", n.id)}<button class="g s">${off ? "✅ " + h(t("تفعيل")) : "⛔ " + h(t("إيقاف"))}</button>`)}${F("news_pin", `${hid("id", n.id)}<button class="g s">${num(n.pinned) ? h(t("إلغاء التثبيت")) : "📌 " + h(t("تثبيت"))}</button>`)}${F("news_notify", `${hid("id", n.id)}<button class="g s" onclick="return confirm('${h(t("إرسال إشعار بهذا الخبر لجميع المستخدمين؟"))}')">🔔 ${h(t("إشعار"))}</button>`)}<button type="button" class="g s" ${tog("tr" + n.id)}>✏️ ${h(t("الترجمة"))}</button></div>
      ${n.link ? `<div class="sm" style="margin-top:6px"><a href="${h(n.link)}" target="_blank" rel="noopener">${h(t("المصدر الأصلي"))}</a></div>` : ""}<details id="tr${n.id}" style="margin-top:8px"><summary style="display:none"></summary>${form(n)}<div class="acts">${F("news_del", `${hid("id", n.id)}<button class="r s" onclick="return confirm('${h(t("حذف الخبر؟"))}')">🗑 ${h(t("حذف"))}</button>`)}</div></details></div>`; }).join("") || `<p class="hint">${h(t("لا توجد أخبار."))}</p>`}</div>`;
  return { title: "📰 " + t("أخبار Hay Day"), body, js: PICK_JS };
}
