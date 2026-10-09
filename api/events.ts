// Hay Day weekly events: manual events, weekly recurring rules and optional import from a trusted external feed (JSON / iCal).
// All times are stored as UTC epoch seconds (the game's own clock is UTC; weekly events start Monday 08:00 UTC).
import { run, first, count, num, nowS, serial, Row, h, ok, getSet, putSet, okImg } from "./core";
import { IMG, imgUrl, WEB_ORIGIN } from "./shop";
import type { Ctx } from "./panel_ui";
import { statusChip, fmtT, picker, field, PICK_JS } from "./panel_ui";

await run(`CREATE TABLE IF NOT EXISTS hd_events (id ${serial}, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'other', image TEXT,
  start_at BIGINT NOT NULL, end_at BIGINT NOT NULL, rewards TEXT NOT NULL DEFAULT '', rewards_en TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', ext_id TEXT NOT NULL DEFAULT '',
  active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);
await run(`CREATE TABLE IF NOT EXISTS hd_event_rules (id ${serial}, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'other', weekday INT NOT NULL, hour INT NOT NULL, minute INT NOT NULL DEFAULT 0,
  duration_h INT NOT NULL, rewards TEXT NOT NULL DEFAULT '', rewards_en TEXT NOT NULL DEFAULT '', active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);

await run(`CREATE TABLE IF NOT EXISTS hd_news (id ${serial}, title TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', cat TEXT NOT NULL DEFAULT 'news',
  image TEXT, link TEXT NOT NULL DEFAULT '', pinned INT NOT NULL DEFAULT 0, published_at BIGINT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', ext_id TEXT NOT NULL DEFAULT '', active INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`);

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

type Ev = { id: string; name: string; name_en: string; kind: string; image: string; start: number; end: number; rewards: string; rewards_en: string; status: string; auto: number };

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
  const rows = await run(`SELECT e.id, e.name, e.name_en, e.kind, e.rewards, e.rewards_en, e.start_at, e.end_at, e.updated_at, ${IMG("image", "e.")} FROM hd_events e WHERE e.active = 1 AND e.end_at > $1 ORDER BY e.start_at, e.id`, [n - KEEP_ENDED]);
  const evs: Ev[] = rows.map((r) => ({ id: "e" + r.id, name: r.name, name_en: r.name_en || "", kind: r.kind, image: imgUrl("e", r) ?? defImg(r.kind), start: num(r.start_at), end: num(r.end_at), rewards: r.rewards || "", rewards_en: r.rewards_en || "", status: status(num(r.start_at), num(r.end_at), n), auto: 0 }));
  for (const x of await ruleEvents(n)) if (x.end > n - KEEP_ENDED) evs.push(x);
  const order: Record<string, number> = { running: 0, upcoming: 1, ended: 2 };
  evs.sort((a, b) => order[a.status] - order[b.status] || (a.status === "ended" ? b.end - a.end : a.start - b.start) || a.name.localeCompare(b.name));
  const upd = Math.max(num((await first(`SELECT MAX(updated_at) m FROM hd_events`))?.m), num((await first(`SELECT MAX(updated_at) m FROM hd_event_rules`))?.m), num(await getSet("ev_sync_at", "0")));
  return { now: n, updated_at: upd, events: evs };
}

export async function listNews() {
  const rows = await run(`SELECT n.id, n.title, n.title_en, n.body, n.body_en, n.cat, n.link, n.pinned, n.published_at, n.updated_at, ${IMG("image", "n.")} FROM hd_news n WHERE n.active = 1 ORDER BY n.pinned DESC, n.published_at DESC, n.id DESC LIMIT 60`);
  const upd = Math.max(num((await first(`SELECT MAX(updated_at) m FROM hd_news`))?.m), num(await getSet("news_sync_at", "0")));
  return {
    now: nowS(), updated_at: upd, synced_at: Math.max(num(await getSet("news_sync_try", "0")), upd), note: await getSet("news_note"),
    items: rows.map((r) => ({ id: num(r.id), title: r.title, title_en: r.title_en || "", body: r.body, body_en: r.body_en || "", cat: r.cat, image: imgUrl("w", r), link: r.link || "", pinned: num(r.pinned), date: num(r.published_at) })),
  };
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
    const n = nowS(); let add = 0, upd = 0;
    for (const x of items) {
      const ex = await first(`SELECT id, source, name, name_en, kind, start_at, end_at, rewards FROM hd_events WHERE ext_id = $1`, [x.ext]);
      if (!ex) { await run(`INSERT INTO hd_events (name, name_en, kind, image, start_at, end_at, rewards, source, ext_id, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'import',$8,1,$9,$9)`, [x.name, x.name_en, x.kind, x.image || null, x.s, x.e, x.rewards, x.ext, n]); add++; }
      else if (ex.source === "import" && (ex.name !== x.name || num(ex.start_at) !== x.s || num(ex.end_at) !== x.e || ex.rewards !== x.rewards || ex.kind !== x.kind)) {
        await run(`UPDATE hd_events SET name=$1, name_en=$2, kind=$3, start_at=$4, end_at=$5, rewards=$6, updated_at=$7 WHERE id=$8`, [x.name, x.name_en, x.kind, x.s, x.e, x.rewards, n, ex.id]); upd++;
      }
    }
    msg = `تمت المزامنة: ${items.length} حدث في المصدر · جديد ${add} · محدَّث ${upd}`;
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
export async function syncNews(): Promise<string> {
  const url = (await getSet("news_src_url")).trim();
  if (!/^https:\/\//.test(url)) return "لم يُضبط رابط مصدر الأخبار (https)";
  let msg = "", good = "0";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const items = parseNews((await r.text()).slice(0, 3_000_000)).slice(0, 100);
    const n = nowS(); let add = 0, upd = 0;
    for (const x of items) {
      const ex = await first(`SELECT id, source, title, body, cat, link, published_at FROM hd_news WHERE ext_id = $1`, [x.ext]);
      if (!ex) { await run(`INSERT INTO hd_news (title, body, cat, image, link, pinned, published_at, source, ext_id, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'import',$8,1,$9,$9)`, [x.title, x.body, x.cat, x.image || null, x.link, x.pinned, x.date, x.ext, n]); add++; }
      else if (ex.source === "import" && (ex.title !== x.title || ex.body !== x.body || ex.link !== x.link)) { await run(`UPDATE hd_news SET title=$1, body=$2, link=$3, updated_at=$4 WHERE id=$5`, [x.title, x.body, x.link, n, ex.id]); upd++; }
    }
    msg = `تمت المزامنة: ${items.length} خبر في المصدر · جديد ${add} · محدَّث ${upd}`; good = "1";
    if (add || upd) await putSet("news_sync_at", String(n));
  } catch (e: any) { msg = "فشلت المزامنة: " + String(e?.message ?? e).slice(0, 120); }
  await putSet("news_sync_ok", good); await putSet("news_sync_try", String(nowS())); await putSet("news_sync_msg", msg);
  return msg;
}

// hourly background sync when a source is configured (and cleanup of long-ended imported events)
setInterval(async () => {
  try {
    if ((await getSet("ev_auto", "1")) === "1" && /^https:\/\//.test((await getSet("ev_src_url")).trim())) await syncEvents();
    if ((await getSet("news_auto", "1")) === "1" && /^https:\/\//.test((await getSet("news_src_url")).trim())) await syncNews();
    await run(`DELETE FROM hd_events WHERE end_at < $1 AND source = 'import'`, [nowS() - 30 * 86400]);
  } catch (e) { console.error("events sync", e); }
}, 3600_000);

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
        await run(`UPDATE hd_events SET name=$1, name_en=$2, kind=$3, start_at=$4, end_at=$5, rewards=$6, rewards_en=$7, active=$8, source='manual', updated_at=$9 WHERE id=$10`, [...v, t, id]);
        if (img && okImg(img)) await run(`UPDATE hd_events SET image=$1 WHERE id=$2`, [img, id]);
        if (f("noimg") === "1") await run(`UPDATE hd_events SET image=NULL WHERE id=$1`, [id]);
        return "تم حفظ الحدث";
      }
      await run(`INSERT INTO hd_events (name, name_en, kind, start_at, end_at, rewards, rewards_en, active, image, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10,$10)`, [...v, img || null, t]);
      return "تمت إضافة الحدث";
    }
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
    case "news_save": {
      const title = f("title").trim().slice(0, 200), cat = CAT_OK.has(f("cat")) ? f("cat") : "news", link = f("link").trim();
      if (!title) return "عنوان الخبر مطلوب";
      if (link && !/^https:\/\/[^\s]{4,580}$/.test(link)) return "رابط الخبر يجب أن يبدأ بـ https://";
      const d = parseUtc(f("date")) || t;
      const v = [title, f("title_en").trim().slice(0, 200), f("body").trim().slice(0, 4000), f("body_en").trim().slice(0, 4000), cat, link, f("pinned") === "1" ? 1 : 0, d, f("active") === "1" ? 1 : 0];
      if (id > 0) {
        await run(`UPDATE hd_news SET title=$1, title_en=$2, body=$3, body_en=$4, cat=$5, link=$6, pinned=$7, published_at=$8, active=$9, updated_at=$10 WHERE id=$11`, [...v, t, id]);
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
      await putSet("news_src_url", u); await putSet("news_auto", f("auto") === "1" ? "1" : "0"); await putSet("news_note", f("note").trim().slice(0, 200));
      return "تم حفظ إعدادات الأخبار";
    }
    case "news_sync": return syncNews();
  }
  return "إجراء غير معروف";
}

export async function eventsPage(ctx: Ctx): Promise<{ title: string; body: string; js?: string }> {
  const { t, F, hid } = ctx;
  const n = nowS();
  const kindSel = (cur: string) => `<select class="w" name="kind">${KINDS.map(([k, a]) => `<option value="${k}"${k === cur ? " selected" : ""}>${h(t(a))}</option>`).join("")}</select>`;
  const dt = (name: string, v: number) => `<input type="datetime-local" class="w" name="${name}" value="${v ? toInp(v) : ""}" required>`;
  const chk = (name: string, label: string, on: boolean) => `<label class="row" style="gap:6px"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}> ${h(label)}</label>`;
  const evForm = (e?: Row) => F("ev_save", `${e ? hid("id", e.id) : ""}
    <div class="fg">${field(t("اسم الحدث (عربي)"), `<input type="text" class="w" name="name" maxlength="120" value="${h(e?.name ?? "")}" required>`)}${field(t("الاسم بالإنجليزية"), `<input type="text" class="w" name="name_en" maxlength="120" value="${h(e?.name_en ?? "")}">`)}
    ${field(t("النوع"), kindSel(e?.kind ?? "other"))}${field(t("البداية (توقيت اللعبة UTC)"), dt("start", num(e?.start_at)))}${field(t("النهاية (توقيت اللعبة UTC)"), dt("end", num(e?.end_at)))}
    ${field(t("المكافآت (عربي)"), `<input type="text" class="w" name="rewards" maxlength="400" value="${h(e?.rewards ?? "")}">`)}${field(t("المكافآت بالإنجليزية"), `<input type="text" class="w" name="rewards_en" maxlength="400" value="${h(e?.rewards_en ?? "")}">`)}</div>
    <div class="row" style="margin-top:10px">${chk("active", t("ظاهر في التطبيق"), e ? !!num(e.active) : true)}${picker(e ? imgUrl("e", e) : null)}${e ? chk("noimg", t("إزالة الصورة المخصصة"), false) : ""}<button class="${e ? "" : "y"}">${h(t(e ? "حفظ" : "إضافة الحدث"))}</button></div>`);
  const rows = await run(`SELECT e.id, e.name, e.name_en, e.kind, e.rewards, e.rewards_en, e.start_at, e.end_at, e.active, e.source, ${IMG("image", "e.")} FROM hd_events e ORDER BY e.start_at DESC, e.id DESC LIMIT 200`);
  const rules = await run(`SELECT * FROM hd_event_rules ORDER BY weekday, hour, id`);
  const ruleForm = (r?: Row) => F("rule_save", `${r ? hid("id", r.id) : ""}
    <div class="fg">${field(t("اسم الحدث (عربي)"), `<input type="text" class="w" name="name" maxlength="120" value="${h(r?.name ?? "")}" required>`)}${field(t("الاسم بالإنجليزية"), `<input type="text" class="w" name="name_en" maxlength="120" value="${h(r?.name_en ?? "")}">`)}
    ${field(t("النوع"), kindSel(r?.kind ?? "other"))}
    ${field(t("يوم البداية (UTC)"), `<select class="w" name="weekday">${DAYS.map((d, i) => `<option value="${i}"${i === num(r?.weekday ?? 1) ? " selected" : ""}>${h(t(d))}</option>`).join("")}</select>`)}
    ${field(t("الساعة (UTC)"), `<input type="number" class="w" name="hour" min="0" max="23" value="${num(r?.hour ?? 8)}" required>`)}${field(t("الدقيقة"), `<input type="number" class="w" name="minute" min="0" max="59" value="${num(r?.minute)}">`)}
    ${field(t("المدة بالساعات"), `<input type="number" class="w" name="duration_h" min="1" max="336" value="${num(r?.duration_h ?? 24)}" required>`)}
    ${field(t("المكافآت (عربي)"), `<input type="text" class="w" name="rewards" maxlength="400" value="${h(r?.rewards ?? "")}">`)}${field(t("المكافآت بالإنجليزية"), `<input type="text" class="w" name="rewards_en" maxlength="400" value="${h(r?.rewards_en ?? "")}">`)}</div>
    <div class="row" style="margin-top:10px">${chk("active", t("مفعّلة"), r ? !!num(r.active) : true)}<button class="${r ? "" : "y"}">${h(t(r ? "حفظ" : "إضافة قاعدة"))}</button></div>`);
  const src = await getSet("ev_src_url"), auto = (await getSet("ev_auto", "1")) === "1", syncAt = num(await getSet("ev_sync_at", "0")), tryAt = num(await getSet("ev_sync_try", "0")), msg = await getSet("ev_sync_msg"), syncOk = (await getSet("ev_sync_ok")) === "1";
  const live = await listEvents();
  const cnt = (s: string) => live.events.filter((x) => x.status === s).length;
  let body = `<p class="hint">${h(t("كل الأوقات بتوقيت اللعبة (UTC). تظهر الأحداث في التطبيق فورًا بعد الحفظ دون تحديث التطبيق، ويُحسب حالها (جارٍ / قادم / منتهٍ) تلقائيًا حسب الوقت."))}</p>
    <div class="row"><span class="chip ok"><b>${cnt("running")}</b> ${h(t("جارٍ الآن"))}</span><span class="chip processing"><b>${cnt("upcoming")}</b> ${h(t("قادم"))}</span><span class="chip"><b>${cnt("ended")}</b> ${h(t("منتهٍ"))}</span><span class="sm">${h(t("آخر تحديث للبيانات"))}: ${fmtT(live.updated_at)}</span></div>
    <div class="box"><h2>${h(t("استيراد من مصدر خارجي"))}</h2>
      <p class="hint">${h(t("لا يوجد API رسمي من Supercell لأحداث Hay Day. إن توفر لديك مصدر موثوق (رابط JSON أو تقويم iCal) ضع رابطه هنا وسيتزامن الخادم معه كل ساعة."))}</p>
      ${F("ev_src", `<div class="row">${`<input type="url" class="w" name="url" placeholder="https://..." value="${h(src)}" style="min-width:260px;flex:1">`}${chk("auto", t("مزامنة تلقائية كل ساعة"), auto)}<button>${h(t("حفظ المصدر"))}</button></div>`)}
      ${src ? F("ev_sync", `<div class="row" style="margin-top:8px"><button class="g">${h(t("مزامنة الآن"))}</button>${tryAt ? `<span class="sm">${statusChip(syncOk ? "ok" : "bad", syncOk ? t("ناجحة") : t("فشلت"))} ${fmtT(tryAt)} · ${h(t(msg))}</span>` : ""}</div>`) : ""}
    </div>
    <div class="box"><h2>${h(t("إضافة حدث"))}</h2>${evForm()}</div>
    <div class="box"><h2>${h(t("جدول أسبوعي متكرر"))}</h2><p class="hint">${h(t("لأحداث تتكرر كل أسبوع في نفس اليوم والساعة (مثلًا يوم الاثنين 08:00 UTC لمدة 24 ساعة). يولّدها الخادم تلقائيًا للأسابيع القادمة دون إعادة إدخالها."))}</p>${ruleForm()}</div>`;
  if (rules.length) body += `<h2>${h(t("القواعد المتكررة"))}</h2>` + rules.map((r) => `<div class="item"><div class="row"><b>${h(r.name)}</b>${statusChip(num(r.active) ? "ok" : "bad", num(r.active) ? t("مفعّلة") : t("متوقفة"))}<span class="sm">${h(t(DAYS[num(r.weekday)]))} ${String(num(r.hour)).padStart(2, "0")}:${String(num(r.minute)).padStart(2, "0")} UTC · ${num(r.duration_h)}${h(t("س"))}</span></div>
    <details><summary>${h(t("تعديل"))}</summary>${ruleForm(r)}</details><div class="acts">${F("rule_del", `${hid("id", r.id)}<button class="r s" onclick="return confirm('${h(t("حذف القاعدة؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`).join("");
  body += `<h2>${h(t("الأحداث"))}</h2>` + (live.events.length || rows.length ? `<div class="acts">${F("ev_clone_week", `<button class="g s" onclick="return confirm('${h(t("نسخ أحداث آخر 7 أيام إلى الأسبوع القادم؟"))}')">${h(t("نسخ أحداث الأسبوع الماضي للأسبوع القادم"))}</button>`)}${F("ev_clear_ended", `<button class="g s" onclick="return confirm('${h(t("حذف كل الأحداث المنتهية؟"))}')">${h(t("حذف المنتهية"))}</button>`)}</div>` : "");
  body += rows.map((e) => { const st = status(num(e.start_at), num(e.end_at), n); const k = KINDS.find((x) => x[0] === e.kind);
    return `<div class="item"><div class="row"><img class="th" style="width:44px;height:44px;border-radius:10px;object-fit:cover" src="${h(imgUrl("e", e) ?? defImg(e.kind))}" alt=""><b>${h(e.name)}</b>${statusChip(st === "running" ? "ok" : st === "upcoming" ? "processing" : "bad", t(st === "running" ? "جارٍ الآن" : st === "upcoming" ? "قادم" : "منتهٍ"))}${e.source === "import" ? statusChip("processing", t("مستورد")) : ""}${num(e.active) ? "" : statusChip("bad", t("مخفي"))}<span class="sm">${h(t(k?.[1] ?? ""))} · ${fmtU(e.start_at)} → ${fmtU(e.end_at)}</span></div>
    <details><summary>${h(t("تعديل"))}</summary>${evForm(e)}</details><div class="acts">${F("ev_del", `${hid("id", e.id)}<button class="r s" onclick="return confirm('${h(t("حذف الحدث؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`; }).join("");
  return { title: t("أحداث Hay Day"), body, js: PICK_JS };
}

export async function newsPage(ctx: Ctx): Promise<{ title: string; body: string; js?: string }> {
  const { t, F, hid } = ctx;
  const chk = (name: string, label: string, on: boolean) => `<label class="row" style="gap:6px"><input type="checkbox" name="${name}" value="1"${on ? " checked" : ""}> ${h(label)}</label>`;
  const catSel = (cur: string) => `<select class="w" name="cat">${NCATS.map(([k, a]) => `<option value="${k}"${k === cur ? " selected" : ""}>${h(t(a))}</option>`).join("")}</select>`;
  const form = (n?: Row) => F("news_save", `${n ? hid("id", n.id) : ""}<div class="fg">
    ${field(t("العنوان (عربي)"), `<input type="text" class="w" name="title" maxlength="200" value="${h(n?.title ?? "")}" required>`)}${field(t("العنوان بالإنجليزية"), `<input type="text" class="w" name="title_en" maxlength="200" value="${h(n?.title_en ?? "")}">`)}
    ${field(t("التصنيف"), catSel(n?.cat ?? "events"))}${field(t("تاريخ النشر (UTC)"), `<input type="datetime-local" class="w" name="date" value="${toInp(num(n?.published_at) || nowS())}">`)}
    ${field(t("رابط الخبر الكامل (اختياري)"), `<input type="url" class="w" name="link" placeholder="https://..." value="${h(n?.link ?? "")}">`)}</div>
    <p style="margin-top:10px">${field(t("نص الخبر (عربي)"), `<textarea name="body" maxlength="4000">${h(n?.body ?? "")}</textarea>`)}</p><p style="margin-top:6px">${field(t("نص الخبر بالإنجليزية"), `<textarea name="body_en" maxlength="4000">${h(n?.body_en ?? "")}</textarea>`)}</p>
    <div class="row" style="margin-top:10px">${chk("pinned", t("تثبيت في الأعلى"), !!num(n?.pinned))}${chk("active", t("ظاهر في التطبيق"), n ? !!num(n.active) : true)}${picker(n ? imgUrl("w", n) : null)}${n ? chk("noimg", t("إزالة الصورة"), false) : ""}<button class="${n ? "" : "y"}">${h(t(n ? "حفظ" : "نشر الخبر"))}</button></div>`);
  const rows = await run(`SELECT n.*, ${IMG("image", "n.")} FROM hd_news n ORDER BY n.pinned DESC, n.published_at DESC, n.id DESC LIMIT 100`);
  const src = await getSet("news_src_url"), auto = (await getSet("news_auto", "1")) === "1", note = await getSet("news_note"), tryAt = num(await getSet("news_sync_try", "0")), ok1 = (await getSet("news_sync_ok")) === "1", msg = await getSet("news_sync_msg");
  let body = `<p class="hint">${h(t("تظهر الأخبار في تبويب «أخبار Hay Day» في التطبيق فور حفظها دون تحديث التطبيق. أوقات النشر بتوقيت UTC."))}</p>
    <div class="box"><h2>${h(t("المصدر والإعدادات"))}</h2>
    <p class="hint">${h(t("اختياريًا: ضع رابط RSS أو Atom أو JSON لمصدر أخبار تثق به وسيستورد الخادم منه كل ساعة. لا يوجد API رسمي لأخبار Hay Day، لذلك يمكنك أيضًا نشر الأخبار يدويًا."))}</p>
    ${F("news_src", `<div class="fg">${field(t("رابط المصدر (https)"), `<input type="url" class="w" name="url" placeholder="https://..." value="${h(src)}">`)}${field(t("النص أعلى الصفحة (اختياري)"), `<input type="text" class="w" name="note" maxlength="200" value="${h(note)}" placeholder="${h(t("يتحدّث تلقائياً"))}">`)}</div><div class="row" style="margin-top:8px">${chk("auto", t("مزامنة تلقائية كل ساعة"), auto)}<button>${h(t("حفظ"))}</button></div>`)}
    ${src ? F("news_sync", `<div class="row" style="margin-top:8px"><button class="g">${h(t("مزامنة الآن"))}</button>${tryAt ? `<span class="sm">${statusChip(ok1 ? "ok" : "bad", ok1 ? t("ناجحة") : t("فشلت"))} ${fmtT(tryAt)} · ${h(t(msg))}</span>` : ""}</div>`) : ""}</div>
    <div class="box"><h2>${h(t("خبر جديد"))}</h2>${form()}</div><h2>${h(t("الأخبار"))} (${rows.length})</h2>`;
  body += rows.map((n) => `<div class="item"><div class="row">${imgUrl("w", n) ? `<img class="th" style="width:56px;height:36px;border-radius:8px;object-fit:cover" src="${h(imgUrl("w", n))}" alt="">` : ""}<b>${h(n.title)}</b>${statusChip("processing", t(NCATS.find((c) => c[0] === n.cat)?.[1] ?? ""))}${num(n.pinned) ? statusChip("ok", t("مثبّت")) : ""}${n.source === "import" ? statusChip("processing", t("مستورد")) : ""}${num(n.active) ? "" : statusChip("bad", t("مخفي"))}<span class="sm">${fmtU(n.published_at)}</span></div>
    <details><summary>${h(t("تعديل"))}</summary>${form(n)}</details><div class="acts">${F("news_del", `${hid("id", n.id)}<button class="r s" onclick="return confirm('${h(t("حذف الخبر؟"))}')">${h(t("حذف"))}</button>`)}</div></div>`).join("") || `<p class="hint">${h(t("لا توجد أخبار بعد."))}</p>`;
  return { title: t("أخبار Hay Day"), body, js: PICK_JS };
}
