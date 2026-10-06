// Push broadcasts from the admin panel: "send update notification" to all users or a chosen group, with a delivery log.
import { run, first, count, num, nowS, serial, Row, h, actor } from "./core";
import type { Ctx } from "./panel_ui";
import { statusChip, fmtT } from "./panel_ui";

await run(`CREATE TABLE IF NOT EXISTS push_log (id ${serial}, actor TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, screen TEXT NOT NULL DEFAULT 'home', audience TEXT NOT NULL DEFAULT 'all',
  target TEXT NOT NULL DEFAULT '', users_n INT NOT NULL DEFAULT 0, devices INT NOT NULL DEFAULT 0, sent INT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`);

export const SCREENS: [string, string][] = [["update", "صفحة التحديث (يُحدَّث التطبيق مباشرة)"], ["home", "الصفحة الرئيسية"], ["notifs", "صفحة الإشعارات"], ["orders", "طلباتي"], ["wallet", "المحفظة"], ["support", "الدعم"], ["ai", "المساعد الذكي"]];

export type BroadcastResult = { users: number; devices: number; sent: number; failed: number; unknown: string[] };
export async function broadcast(title: string, body: string, screen: string, userIds: number[] | null): Promise<BroadcastResult> {
  const rows: Row[] = userIds === null ? await run(`SELECT token, tone, user_id FROM push_tokens`)
    : userIds.length ? await run(`SELECT token, tone, user_id FROM push_tokens WHERE user_id IN (${userIds.map((_, i) => "$" + (i + 1)).join(",")})`, userIds) : [];
  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    try {
      const r = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify(chunk.map((x) => ({ to: x.token, title, body, data: { screen }, sound: x.tone === "silent" ? null : `hd_${x.tone}.wav`, channelId: `hd_support_${x.tone}`, priority: "high" }))),
      });
      const j: any = await r.json().catch(() => ({}));
      const list: any[] = Array.isArray(j.data) ? j.data : [];
      for (let k = 0; k < chunk.length; k++) {
        const t = list[k];
        if (t?.status === "ok") sent++;
        else { failed++; if (t?.details?.error === "DeviceNotRegistered") await run(`DELETE FROM push_tokens WHERE token = $1`, [chunk[k].token]); }
      }
    } catch { failed += chunk.length; }
  }
  return { users: new Set(rows.map((x) => num(x.user_id))).size, devices: rows.length, sent, failed, unknown: [] };
}

export async function pushSend(f: (k: string) => string): Promise<string> {
  if (f("ok") !== "1") return "لم يتم تأكيد الإرسال";
  const title = f("title").trim().slice(0, 80), body = f("body").trim().slice(0, 300), screen = SCREENS.some((s) => s[0] === f("screen")) ? f("screen") : "update";
  if (!title || !body) return "العنوان والرسالة مطلوبان";
  const audience = f("audience") === "users" ? "users" : "all";
  const t = nowS();
  if (await first(`SELECT id FROM push_log WHERE title = $1 AND body = $2 AND audience = $3 AND created_at > $4`, [title, body, audience, t - 120])) return "أُرسل نفس الإشعار قبل لحظات. انتظر دقيقتين أو غيّر النص.";
  let ids: number[] | null = null, unknown: string[] = [], target = "";
  if (audience === "users") {
    const names = [...new Set(f("users").split(/[\s,،;]+/).map((x) => x.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))].slice(0, 500);
    if (!names.length) return "اكتب اسم مستخدم واحد على الأقل";
    const rs = await run(`SELECT id, username_lc FROM users WHERE username_lc IN (${names.map((_, i) => "$" + (i + 1)).join(",")})`, names);
    ids = rs.map((r) => num(r.id)); const found = new Set(rs.map((r) => r.username_lc)); unknown = names.filter((n) => !found.has(n));
    if (!ids.length) return "لم يتم العثور على أي مستخدم من القائمة";
    target = names.join(", ").slice(0, 500);
  }
  // in-app notification too (visible in the bell even without push permission)
  const targets = ids ?? (await run(`SELECT id FROM users`)).map((r) => num(r.id));
  for (const uid of targets) await run(`INSERT INTO notifications (user_id, kind, title, body, title_en, body_en, ref, created_at) VALUES ($1,'announce',$2,$3,$2,$3,$4,$5)`, [uid, title, body, "", t]);
  const r = await broadcast(title, body, screen, ids);
  await run(`INSERT INTO push_log (actor, title, body, screen, audience, target, users_n, devices, sent, failed, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [actor(), title, body, screen, audience, target, targets.length, r.devices, r.sent, r.failed, t]);
  return `تم الإرسال: وصل ${r.sent} إشعار بنجاح من ${r.devices} جهاز` + (r.failed ? ` (فشل ${r.failed})` : "") + (unknown.length ? ` · أسماء غير موجودة: ${unknown.slice(0, 5).join("، ")}` : "") + (r.devices === 0 ? " · لا توجد أجهزة مسجّلة للإشعارات بعد" : "");
}

export async function pushPage(ctx: Ctx): Promise<{ title: string; body: string; js?: string }> {
  const { t, F } = ctx;
  const devices = await count(`SELECT COUNT(*) c FROM push_tokens`), usersN = await count(`SELECT COUNT(DISTINCT user_id) c FROM push_tokens`), all = await count(`SELECT COUNT(*) c FROM users`);
  const form = F("push_send", `<input type="hidden" name="ok" value="0" id="pk">
    <div class="fg"><div><label class="f">${h(t("عنوان الإشعار"))}</label><input type="text" class="w" name="title" maxlength="80" value="${h(t("تحديث جديد من HD Market"))}" required></div>
    <div><label class="f">${h(t("الصفحة التي تُفتح عند الضغط"))}</label><select class="w" name="screen">${SCREENS.map(([k, l]) => `<option value="${k}">${h(t(l))}</option>`).join("")}</select></div></div>
    <p style="margin-top:10px"><label class="f">${h(t("نص الرسالة"))}</label><textarea name="body" maxlength="300" required>${h(t("يتوفر تحديث جديد للتطبيق. اضغط لفتح HD Market وتحديثه الآن."))}</textarea></p>
    <p style="margin-top:6px"><label class="row" style="gap:6px"><input type="radio" name="audience" value="all" checked> ${h(t("جميع المستخدمين"))}</label>
    <label class="row" style="gap:6px"><input type="radio" name="audience" value="users"> ${h(t("مستخدمون محددون"))}</label></p>
    <p id="pu" style="display:none"><textarea name="users" placeholder="${h(t("أسماء المستخدمين، مفصولة بفاصلة أو سطر جديد"))}"></textarea></p>
    <button class="y" id="psend">${h(t("إرسال إشعار التحديث"))}</button>`);
  const logs = await run(`SELECT * FROM push_log ORDER BY id DESC LIMIT 50`);
  const body = `<p class="hint">${h(t("يصل الإشعار إلى هاتف المستخدم حتى لو كان التطبيق مغلقًا، بشرط أن يكون قد سمح بإشعارات التطبيق وسجّل دخوله مرة واحدة على الأقل."))}</p>
    <div class="row"><span class="chip"><b>${devices}</b> ${h(t("جهاز مسجّل للإشعارات"))}</span><span class="chip ok"><b>${usersN}</b> ${h(t("مستخدم"))} / ${all}</span></div>
    <div class="box"><h2>${h(t("إرسال إشعار التحديث"))}</h2>${form}</div>
    <h2>${h(t("سجل الإرسال"))}</h2>${logs.map((l) => `<div class="item"><div class="row"><b>${h(l.title)}</b>${statusChip(num(l.failed) ? "processing" : "ok", `${num(l.sent)} ${t("وصل")}${num(l.failed) ? " · " + num(l.failed) + " " + t("فشل") : ""}`)}<span class="sm">${fmtT(l.created_at)} · ${h(String(l.actor))}</span></div><div>${h(l.body)}</div><div class="sm">${l.audience === "all" ? h(t("الجميع")) : h(t("مستخدمون محددون")) + ": " + h(l.target)} · ${num(l.devices)} ${h(t("جهاز"))} · ${h(SCREENS.find((s) => s[0] === l.screen)?.[1] ?? l.screen)}</div></div>`).join("") || `<p class="hint">${h(t("لم يُرسل أي إشعار بعد."))}</p>`}`;
  const js = `<script>(function(){var f=document.getElementById("psend").form,pu=document.getElementById("pu");
f.addEventListener("change",function(e){if(e.target.name=="audience")pu.style.display=e.target.value=="users"?"block":"none"});
f.addEventListener("submit",function(e){var a=f.audience.value;var m=a=="all"?${JSON.stringify(t("هل أنت متأكد من إرسال إشعار التحديث إلى جميع المستخدمين؟"))}:${JSON.stringify(t("هل أنت متأكد من إرسال الإشعار إلى المستخدمين المحددين؟"))};
if(!confirm(m)){e.preventDefault();return}document.getElementById("pk").value="1";document.getElementById("psend").disabled=true;});})();</script>`;
  return { title: t("إرسال إشعار التحديث"), body, js };
}

// Automatic "app updated" notification (in-app + push) to every user; used by the force-update button and APK version changes.
export async function notifyUpdate(version = ""): Promise<string> {
  const m: Record<string, string> = { ok: "1", audience: "all", screen: "update", title: "تحديث جديد من HD Market", body: version ? `يتوفر تحديث جديد للتطبيق (${version}). اضغط لفتح HD Market وتحديثه الآن.` : "يتوفر تحديث جديد للتطبيق. اضغط لفتح HD Market وتحديثه الآن." };
  return pushSend((k) => m[k] ?? "");
}
