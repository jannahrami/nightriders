// دالة الحافة resolve-link: تفك روابط Google Maps المختصرة (maps.app.goo.gl) وتستخرج الإحداثيات واسم المكان.
// للأعضاء المسجّلين فقط، ولا تزور إلا نطاقات Google (لمنع استخدامها لزيارة أي رابط).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

let KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!KEY) { try { KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { /* */ } }
const sb = createClient(Deno.env.get("SUPABASE_URL")!, KEY, { auth: { persistSession: false } });

const ALLOWED = /(^|\.)(goo\.gl|google\.com|google\.com\.sa|g\.co|app\.goo\.gl)$/i;
const okHost = (u: URL) => u.protocol === "https:" && ALLOWED.test(u.hostname);
const valid = (lat: number, lng: number) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function fromText(t: string): { lat: number; lng: number } | null {
  let s = t.replace(/\+/g, " ");
  try { s = decodeURIComponent(s); } catch { /* نص فيه % غير صالحة */ }
  const pats = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                 // بيانات المكان الدقيقة
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,                   // مركز الخريطة
    /[?&](?:q|query|ll|daddr|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /center=(-?\d{1,2}\.\d+)%2C(-?\d{1,3}\.\d+)/i,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) { const lat = parseFloat(m[1]), lng = parseFloat(m[2]); if (valid(lat, lng)) return { lat, lng }; }
  }
  return null;
}
// صفحة التضمين (output=embed): فيها إحداثيات المكان واسمه
function embedPlace(h: string): { lat: number; lng: number; name?: string } | null {
  // "العنوان",[LAT,LNG],"معرّف"],"اسم المكان"
  let m = h.match(/\\?"\s*,\s*\[(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]\s*,\s*\\?"\d+\\?"\s*\]\s*,\s*\\?"([^"\\]{1,120})\\?"/);
  if (m) { const lat = parseFloat(m[1]), lng = parseFloat(m[2]); if (valid(lat, lng)) return { lat, lng, name: m[3].trim() }; }
  m = h.match(/\\?"\s*,\s*\[(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/);
  if (m) { const lat = parseFloat(m[1]), lng = parseFloat(m[2]); if (valid(lat, lng)) return { lat, lng }; }
  // مركز العرض [[[مقياس,LNG,LAT]
  m = h.match(/\[\[\[[\d.]+,(-?\d{1,3}\.\d{4,}),(-?\d{1,2}\.\d{4,})\]/);
  if (m) { const lng = parseFloat(m[1]), lat = parseFloat(m[2]); if (valid(lat, lng)) return { lat, lng }; }
  return null;
}
function nameFrom(u: string): string | null {
  const m = u.match(/\/maps\/place\/([^/@?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")).slice(0, 80); } catch { return null; }
}

async function authed(req: Request): Promise<boolean> {
  // للاختبار من قاعدة البيانات فقط: نفس السر الداخلي لدالة الإشعارات
  const sec = req.headers.get("x-nr-secret");
  if (sec) { const { data } = await sb.rpc("get_push_config"); return !!data?.notify_secret && sec === data.notify_secret; }
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  const { data } = await sb.auth.getUser(tok);
  if (!data?.user) return false;
  const { data: p } = await sb.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  return p?.status === "active";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!(await authed(req))) return json({ error: "unauthorized" }, 401);
  let url: URL;
  try { url = new URL(String((await req.json()).url ?? "").trim()); } catch { return json({ error: "bad_url" }, 400); }
  if (!okHost(url)) return json({ error: "not_google" }, 400);

  let cur = url.toString(), name: string | null = null;
  for (let hop = 0; hop < 6; hop++) {
    const direct = fromText(cur);
    name = name ?? nameFrom(cur);
    if (direct) return json({ ...direct, name });
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(cur, { redirect: "manual", signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "Accept-Language": "ar,en" } });
    } catch { clearTimeout(t); return json({ error: "fetch_failed" }, 502); }
    clearTimeout(t);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, cur);
      if (!okHost(next)) return json({ error: "not_google" }, 400);
      cur = next.toString();
      continue;
    }
    // آخر صفحة: نبحث في محتواها عن الإحداثيات
    const html = (await res.text()).slice(0, 600000);
    const inPage = fromText(html);
    name = name ?? nameFrom(html.match(/https:\/\/www\.google\.[^"' ]+\/maps\/place\/[^"' ]+/)?.[0] ?? "");
    if (!name) { const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i); if (og) name = og[1].split(" · ")[0].slice(0, 80); }
    if (inPage) return json({ ...inPage, name });
    // محاولة ثانية: نسخة التضمين (embed) لنفس الرابط تحتوي غالبًا موقع المكان
    try {
      const q = new URL(cur).searchParams.get("q");
      if (!name && q) name = q.split(/[,،]/)[0].trim().slice(0, 80) || null;
      const emb = new URL(cur); emb.searchParams.set("output", "embed"); emb.searchParams.set("hl", "ar");
      const r2 = await fetch(emb.toString(), { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ar,en" } });
      const h2 = (await r2.text()).slice(0, 800000);
      const c2 = embedPlace(h2);
      if (c2) return json({ lat: c2.lat, lng: c2.lng, name: c2.name || name });
    } catch { /* */ }
    return json({ error: "no_coords", name }, 404);
  }
  return json({ error: "too_many_redirects" }, 508);
});
