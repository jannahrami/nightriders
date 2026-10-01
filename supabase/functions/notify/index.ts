// دالة الحافة notify: تستقبل حدث (طلعة/مساعدة/رسالة) من Trigger قاعدة البيانات وترسل إشعارات Web Push.
// الحماية: لا تقبل إلا طلبًا يحمل x-nr-secret المطابق للقيمة في private.app_secrets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

let KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!KEY) { try { KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { /* */ } }
const sb = createClient(Deno.env.get("SUPABASE_URL")!, KEY, { auth: { persistSession: false } });

type Cfg = { secret: string; app: webpush.ApplicationServer };
let cfgP: Promise<Cfg> | null = null;
function cfg(): Promise<Cfg> {
  if (!cfgP) {
    cfgP = (async () => {
      const { data, error } = await sb.rpc("get_push_config");
      if (error || !data?.vapid) throw error ?? new Error("no_config");
      const vapidKeys = await webpush.importVapidKeys(JSON.parse(data.vapid), { extractable: false });
      const app = await webpush.ApplicationServer.new({ contactInformation: data.contact, vapidKeys });
      return { secret: data.notify_secret as string, app };
    })().catch((e) => { cfgP = null; throw e; });
  }
  return cfgP;
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const HELP: Record<string, string> = { flat_tire: "بنشر", breakdown: "عطل", fuel: "نفاد بنزين", other: "مساعدة" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "long", hour: "numeric", minute: "2-digit" });

async function nameOf(id: string) {
  const { data } = await sb.from("profiles").select("display_name").eq("id", id).maybeSingle();
  return data?.display_name ?? "عضو";
}

// deno-lint-ignore no-explicit-any
async function build(table: string, r: any) {
  if (table === "rides") {
    const who = await nameOf(r.organizer_id ?? r.created_by);
    return { kind: "ride", ride: null, exclude: r.created_by,
      msg: { title: "🏍️ طلعة جديدة", body: cut(`${r.title} — ${fmt.format(new Date(r.meet_at))} · ${r.meet_name ?? ""} (${who})`, 180),
        url: `#/ride/${r.id}`, tag: `ride-${r.id}`, urgent: false } };
  }
  if (table === "help_requests") {
    const who = await nameOf(r.user_id);
    return { kind: "help", ride: null, exclude: r.user_id,
      msg: { title: `🆘 ${who} يحتاج فزعة`, body: cut(`${HELP[r.kind] ?? "مساعدة"}${r.description ? " — " + r.description : ""}`, 180),
        url: "#/help", tag: `help-${r.id}`, urgent: true } };
  }
  if (table === "messages") {
    const who = await nameOf(r.user_id);
    let where = "";
    if (r.ride_id) {
      const { data } = await sb.from("rides").select("title").eq("id", r.ride_id).maybeSingle();
      where = data?.title ? ` · ${data.title}` : "";
    }
    const text = (r.body ?? "").trim();
    return { kind: "chat", ride: r.ride_id ?? null, exclude: r.user_id,
      msg: { title: cut(`💬 ${who}${where}`, 80), body: text ? cut(text, 160) : "📷 صورة",
        url: r.ride_id ? `#/chat/${r.ride_id}` : "#/chat", tag: r.ride_id ? `chat-${r.ride_id}` : "chat-general", urgent: false } };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  let c: Cfg;
  try { c = await cfg(); } catch (e) { console.error("config", e); return new Response("config", { status: 500 }); }
  if (!safeEqual(req.headers.get("x-nr-secret") ?? "", c.secret)) return new Response("forbidden", { status: 403 });

  const { table, record } = await req.json().catch(() => ({}));
  if (table === "ping") return Response.json({ ok: true, ping: true });
  const ev = record ? await build(table, record) : null;
  if (!ev) return Response.json({ ok: true, skipped: true });

  const { data: subs, error } = await sb.rpc("push_targets", { p_kind: ev.kind, p_ride: ev.ride, p_exclude: ev.exclude });
  if (error) { console.error("targets", error); return new Response("targets", { status: 500 }); }

  const payload = JSON.stringify(ev.msg);
  const gone: string[] = [];
  let sent = 0, failed = 0;
  // deno-lint-ignore no-explicit-any
  await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await c.app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(payload, { ttl: ev.kind === "chat" ? 3600 : 6 * 3600, urgency: ev.msg.urgent ? webpush.Urgency.High : webpush.Urgency.Normal });
      sent++;
    } catch (e) {
      failed++;
      // deno-lint-ignore no-explicit-any
      const st = (e as any)?.response?.status;
      if (st === 404 || st === 410) gone.push(s.endpoint);
      else console.error("push", st, String(e).slice(0, 200));
    }
  }));
  if (gone.length) await sb.rpc("drop_push_subscriptions", { p_endpoints: gone });
  return Response.json({ ok: true, kind: ev.kind, sent, failed, removed: gone.length });
});
