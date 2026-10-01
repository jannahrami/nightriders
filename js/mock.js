// وضع المعاينة: عميل وهمي في الذاكرة يحاكي واجهة supabase-js المستخدمة في التطبيق.
// بيانات تجريبية فقط — لا تتصل بأي خادم ولا تُحفظ. يُحمَّل فقط عند فتح ?preview=1
const ME = '00000000-0000-4000-8000-000000000001';
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
const H = 3600e3, M = 60e3, D = 864e5;
const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(16).slice(2) + Date.now();

function riyadh(dayOffset, hh, mm = 0) {
  const d = new Date(now + dayOffset * D + 3 * H);
  const s = `${d.toISOString().slice(0, 10)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`;
  return new Date(s).toISOString();
}

const db = {
  profiles: [
    { id: ME, display_name: 'أنت (معاينة)', city: 'الرياض', bike_type: 'Harley-Davidson', bike_model: 'Street Glide', riding_style: 'touring', role: 'owner', status: 'active', ready_until: null, created_at: iso(-60 * D) },
    { id: U(2), display_name: 'أبو فهد', city: 'الرياض', bike_type: 'BMW', bike_model: 'R 1250 GS', riding_style: 'long_distance', role: 'admin', status: 'active', ready_until: iso(80 * M), created_at: iso(-50 * D) },
    { id: U(3), display_name: 'سعد', city: 'الرياض', bike_type: 'Yamaha', bike_model: 'MT-09', riding_style: 'calm', role: 'member', status: 'active', ready_until: iso(35 * M), created_at: iso(-40 * D) },
    { id: U(4), display_name: 'تركي', city: 'الخرج', bike_type: 'Ducati', bike_model: 'Scrambler', riding_style: 'touring', role: 'member', status: 'active', ready_until: null, created_at: iso(-30 * D) },
    { id: U(5), display_name: 'ماجد', city: 'الرياض', bike_type: 'Honda', bike_model: 'Africa Twin', riding_style: 'long_distance', role: 'member', status: 'active', ready_until: null, created_at: iso(-20 * D) },
    { id: U(6), display_name: 'نواف', city: 'الرياض', role: 'member', status: 'pending', created_at: iso(-2 * H) },
  ],
  member_contacts: [{ user_id: U(2), phone: '+966500000002', show_phone: true }, { user_id: ME, phone: '', show_phone: false }],
  invites: [
    { id: uid(), code: 'K7M2QX9TPA', note: 'نواف', max_uses: 1, uses: 1, expires_at: iso(2 * D), revoked_at: null, created_by: ME, created_at: iso(-1 * D) },
    { id: uid(), code: 'R4HN8WZ3LC', note: 'شباب الخرج', max_uses: 5, uses: 0, expires_at: iso(5 * D), revoked_at: null, created_by: ME, created_at: iso(-3 * H) },
  ],
  announcements: [
    { id: uid(), title: 'اجتماع الشباب الخميس', body: 'بعد العشاء في الكوفي المعتاد. نناقش طلعة العُلا.', pinned: true, created_by: ME, created_at: iso(-5 * H) },
  ],
  rides: [],
  ride_stops: [],
  ride_participants: [],
  polls: [], poll_options: [], poll_votes: [],
  messages: [],
  member_locations: [
    { user_id: U(2), lat: 24.7743, lng: 46.7386, accuracy_m: 12, ride_id: null, share_until: iso(90 * M), updated_at: iso(-40 * 1000) },
    { user_id: U(3), lat: 24.7210, lng: 46.6400, accuracy_m: 30, ride_id: null, share_until: iso(50 * M), updated_at: iso(-6 * M) },
    { user_id: U(5), lat: 24.6900, lng: 46.7100, accuracy_m: 20, ride_id: null, share_until: iso(2 * H), updated_at: iso(-25 * M) },
  ],
  help_requests: [
    { id: uid(), user_id: U(4), kind: 'flat_tire', description: 'كفر خلفي نازل عند مخرج 9، معي منفاخ بس يبغى له لقمة.', lat: 24.7650, lng: 46.7700, location_accuracy_m: 15, status: 'open', created_at: iso(-12 * M) },
  ],
  help_responders: [],
  ride_media: [],
  listings: [
    { id: 'mk-1', user_id: U(2), title: 'BMW R 1250 GS موديل 2021', price: 68000, category: 'bike', condition: 'used', description: 'ممشى 32 ألف، صيانة وكالة، معه شنط جانبية.', city: 'جدة', photos: [], status: 'active', created_at: iso(-3 * H), expires_at: iso(27 * D) },
    { id: 'mk-2', user_id: U(3), title: 'خوذة Shoei مقاس L', price: 1200, category: 'gear', condition: 'used', description: 'استعمال خفيف.', city: 'جدة', photos: [], status: 'active', created_at: iso(-1 * D), expires_at: iso(29 * D) },
    { id: 'mk-3', user_id: U(4), title: 'جنوط أصلية', price: null, category: 'parts', condition: 'new', description: null, city: 'الخرج', photos: [], status: 'sold', created_at: iso(-5 * D), expires_at: iso(25 * D) },
  ],
};
// طلعات تجريبية
const R1 = uid(), R2 = uid(), R3 = uid();
db.rides.push(
  { id: R1, title: 'طلعة الثمامة الليلية', description: 'سرعة هادية، نتجمع ونطلع سوا. لا تنسى الخوذة والسترة العاكسة.', status: 'planned', organizer_id: ME, created_by: ME,
    meet_at: riyadh(1, 21, 0), depart_at: riyadh(1, 21, 30), return_at: riyadh(2, 0, 30), meet_name: 'محطة الدريس — طريق الملك فهد', meet_lat: 24.7743, meet_lng: 46.6385,
    dest_name: 'منتزه الثمامة', dest_lat: 25.0100, dest_lng: 46.6600, distance_km: null, route_geojson: null, leader_id: U(2), sweep_id: U(3), created_at: iso(-2 * D) },
  { id: R2, title: 'فطور الخرج', description: 'طلعة صباحية للخرج وفطور.', status: 'planned', organizer_id: U(2), created_by: U(2),
    meet_at: riyadh(3, 6, 0), depart_at: riyadh(3, 6, 20), return_at: riyadh(3, 11, 0), meet_name: 'مخرج 18', meet_lat: 24.6300, meet_lng: 46.8000,
    dest_name: 'الخرج', dest_lat: 24.1500, dest_lng: 47.3000, distance_km: null, route_geojson: null, leader_id: null, sweep_id: null, created_at: iso(-1 * D) },
  { id: R3, title: 'طلعة الدرعية', description: null, status: 'completed', organizer_id: U(3), created_by: U(3),
    meet_at: riyadh(-6, 20, 0), depart_at: null, return_at: null, meet_name: 'البجيري', meet_lat: 24.7340, meet_lng: 46.5750,
    dest_name: null, dest_lat: null, dest_lng: null, distance_km: null, route_geojson: null, leader_id: null, sweep_id: null, created_at: iso(-10 * D) },
);
db.ride_stops.push({ id: uid(), ride_id: R1, kind: 'fuel', name: 'محطة ساسكو — طريق الثمامة', lat: 24.9000, lng: 46.6800, position: 0 },
  { id: uid(), ride_id: R1, kind: 'rest', name: 'استراحة قصيرة', lat: 24.9600, lng: 46.6700, position: 1 });
db.ride_participants.push(
  { ride_id: R1, user_id: ME, rsvp: 'going', rsvp_at: iso(-2 * D), progress: null, progress_at: null },
  { ride_id: R1, user_id: U(2), rsvp: 'going', rsvp_at: iso(-1 * D), progress: 'on_way', progress_at: iso(-15 * M) },
  { ride_id: R1, user_id: U(3), rsvp: 'going', rsvp_at: iso(-1 * D), progress: 'arrived', progress_at: iso(-3 * M) },
  { ride_id: R1, user_id: U(5), rsvp: 'maybe', rsvp_at: iso(-5 * H), progress: null, progress_at: null },
  { ride_id: R1, user_id: U(4), rsvp: 'declined', rsvp_at: iso(-4 * H), progress: null, progress_at: null },
  { ride_id: R2, user_id: U(2), rsvp: 'going', rsvp_at: iso(-1 * D), progress: null, progress_at: null },
  { ride_id: R3, user_id: U(3), rsvp: 'going', rsvp_at: iso(-7 * D), progress: 'returned', progress_at: iso(-6 * D + 4 * H) });
const P1 = uid(), O1 = uid(), O2 = uid();
db.polls.push({ id: P1, ride_id: R1, question: 'وين نتعشى بعد الطلعة؟', kind: 'destination', created_by: ME, closes_at: iso(20 * H), created_at: iso(-1 * D) });
db.poll_options.push({ id: O1, poll_id: P1, label: 'مطعم على طريق الثمامة', position: 0 }, { id: O2, poll_id: P1, label: 'نرجع الرياض', position: 1 });
db.poll_votes.push({ poll_id: P1, option_id: O1, user_id: U(2), voted_at: iso(-5 * H) }, { poll_id: P1, option_id: O1, user_id: U(3), voted_at: iso(-4 * H) }, { poll_id: P1, option_id: O2, user_id: U(5), voted_at: iso(-3 * H) });
[['أبو فهد', U(2), 'السلام عليكم يا شباب', -50 * M], ['سعد', U(3), 'وعليكم السلام، مين طالع الليلة؟', -45 * M],
 ['أنت', ME, 'أنا جاهز بعد العشاء', -40 * M], ['أبو فهد', U(2), 'تمام نتجمع عند الدريس 9 ونص', -38 * M]]
  .forEach(([, u, body, t]) => db.messages.push({ id: uid(), ride_id: null, user_id: u, client_id: uid(), body, image_path: null, created_at: iso(t) }));
db.messages.push({ id: uid(), ride_id: R1, user_id: U(2), client_id: uid(), body: 'لا تنسون تعبّون بنزين قبل التجمع', image_path: null, created_at: iso(-2 * H) });

const DEFAULT_ME = { messages: 'user_id', help_requests: 'user_id', help_responders: 'user_id', ride_media: 'user_id', listings: 'user_id', announcements: 'created_by' };
const PK = { profiles: ['id'], member_contacts: ['user_id'], ride_participants: ['ride_id', 'user_id'], poll_votes: ['poll_id', 'user_id'], member_locations: ['user_id'], help_responders: ['request_id', 'user_id'] };
const pk = (t) => PK[t] || ['id'];

// ---------- التحديث المباشر المحلي ----------
const channels = new Set();
function notify(table, eventType, newRow, oldRow) {
  for (const ch of channels) for (const l of ch.listeners) {
    if (l.cfg.table !== table) continue;
    if (l.cfg.event !== '*' && l.cfg.event !== eventType) continue;
    if (l.cfg.filter) {
      const [col, rest] = l.cfg.filter.split('=');
      const val = rest.replace(/^eq\./, '');
      const r = newRow || oldRow;
      if (String(r?.[col]) !== val) continue;
    }
    setTimeout(() => l.cb({ eventType, new: newRow || {}, old: oldRow || {}, table }), 0);
  }
}

// ---------- منشئ الاستعلامات ----------
const err = (message, code) => ({ data: null, error: { message, code } });
class Query {
  constructor(table) { this.t = table; this.filters = []; this.op = 'select'; this._order = []; this._limit = null; this._single = null; this._count = null; this._head = false; this._returning = false; }
  select(_cols, opts) { if (this.op === 'select') { if (opts?.count) this._count = opts.count; if (opts?.head) this._head = true; } else this._returning = true; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c, op, v) { if (op === 'is') this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
  or(expr) {
    const parts = expr.split(',').map((p) => { const [c, op, ...v] = p.split('.'); return { c, op, v: v.join('.').replace(/^"|"$/g, '') }; });
    this.filters.push((r) => parts.some(({ c, op, v }) => (op === 'eq' ? String(r[c]) === v : op === 'gte' ? r[c] >= v : op === 'lte' ? r[c] <= v : false)));
    return this;
  }
  order(c, o = {}) { this._order.push([c, o.ascending !== false]); return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = 'one'; return this; }
  maybeSingle() { this._single = 'maybe'; return this; }
  insert(v) { this.op = 'insert'; this.payload = Array.isArray(v) ? v : [v]; return this; }
  upsert(v, o = {}) { this.op = 'upsert'; this.payload = Array.isArray(v) ? v : [v]; this.onConflict = o.onConflict; return this; }
  update(v) { this.op = 'update'; this.payload = v; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  rows() { return (db[this.t] ||= []).filter((r) => this.filters.every((f) => f(r))); }
  exec() {
    const table = (db[this.t] ||= []);
    let out;
    if (this.op === 'select') {
      out = this.rows();
      for (const [c, asc] of [...this._order].reverse()) out = [...out].sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : (a[c] ?? '') < (b[c] ?? '') ? -1 : 0) * (asc ? 1 : -1));
      const count = out.length;
      if (this._limit != null) out = out.slice(0, this._limit);
      if (this._head) return { data: null, count, error: null };
      out = out.map((r) => ({ ...r }));
    } else if (this.op === 'insert' || this.op === 'upsert') {
      out = [];
      for (const p of this.payload) {
        const row = { ...p };
        if (this.t !== 'member_locations' && !PK[this.t] && !row.id) row.id = uid();
        if (!row.created_at) row.created_at = new Date().toISOString();
        if (DEFAULT_ME[this.t] && !row[DEFAULT_ME[this.t]]) row[DEFAULT_ME[this.t]] = ME;
        if (this.t === 'rides') { row.created_by = ME; row.organizer_id = row.organizer_id || ME; row.status = 'planned'; }
        if (this.t === 'listings') {
          row.status = 'active'; row.expires_at = new Date(Date.now() + 30 * D).toISOString();
          if (table.filter((x) => x.user_id === ME && x.status === 'active' && x.expires_at > new Date().toISOString()).length >= 5) return err('listing_limit');
        }
        if (this.t === 'help_requests') {
          row.status = 'open';
          if (table.some((x) => x.user_id === ME && x.status === 'open')) return err('duplicate key value violates unique constraint "help_one_open_per_user"', '23505');
        }
        if (this.t === 'messages' && table.some((x) => x.user_id === ME && x.client_id === row.client_id)) return err('duplicate key value', '23505');
        const keys = pk(this.t);
        const existing = table.find((x) => keys.every((k) => x[k] === row[k]));
        if (existing && this.op === 'upsert') { const old = { ...existing }; Object.assign(existing, row); notify(this.t, 'UPDATE', { ...existing }, old); out.push({ ...existing }); continue; }
        if (existing && PK[this.t]) return err('duplicate key value', '23505');
        table.push(row); notify(this.t, 'INSERT', { ...row });
        out.push({ ...row });
        if (this.t === 'rides') { db.ride_participants.push({ ride_id: row.id, user_id: row.organizer_id, rsvp: 'going', rsvp_at: row.created_at }); }
      }
    } else if (this.op === 'update') {
      out = [];
      for (const r of this.rows()) { const old = { ...r }; Object.assign(r, this.payload, { updated_at: new Date().toISOString() }); notify(this.t, 'UPDATE', { ...r }, old); out.push({ ...r }); }
    } else if (this.op === 'delete') {
      const del = this.rows();
      db[this.t] = table.filter((r) => !del.includes(r));
      del.forEach((r) => notify(this.t, 'DELETE', null, { ...r }));
      out = del.map((r) => ({ ...r }));
    }
    if (this._single) {
      if (out.length === 0) return this._single === 'maybe' ? { data: null, error: null } : err('No rows found', 'PGRST116');
      return { data: out[0], error: null };
    }
    return { data: out, error: null };
  }
}

// ---------- RPC ----------
function rpc(name, a = {}) {
  const t = new Date().toISOString();
  const ok = (data = null) => Promise.resolve({ data, error: null });
  const P = (id) => db.profiles.find((p) => p.id === id);
  switch (name) {
    case 'set_rsvp': {
      let r = db.ride_participants.find((x) => x.ride_id === a.p_ride && x.user_id === ME);
      const old = r && { ...r };
      if (!r) { r = { ride_id: a.p_ride, user_id: ME, rsvp: a.p_rsvp, rsvp_at: t }; db.ride_participants.push(r); }
      r.rsvp = a.p_rsvp; r.rsvp_at = t; if (a.p_rsvp !== 'going') { r.progress = null; r.progress_at = null; }
      const ride = db.rides.find((x) => x.id === a.p_ride);
      if (a.p_rsvp !== 'going' && ride) { if (ride.leader_id === ME) ride.leader_id = null; if (ride.sweep_id === ME) ride.sweep_id = null; }
      notify('ride_participants', old ? 'UPDATE' : 'INSERT', { ...r }, old); return ok();
    }
    case 'set_progress': {
      const r = db.ride_participants.find((x) => x.ride_id === a.p_ride && x.user_id === ME && x.rsvp === 'going');
      if (!r) return Promise.resolve(err('not_going'));
      r.progress = a.p_progress; r.progress_at = a.p_progress ? t : null; notify('ride_participants', 'UPDATE', { ...r }); return ok();
    }
    case 'cast_vote': {
      db.poll_votes = db.poll_votes.filter((v) => !(v.poll_id === a.p_poll && v.user_id === ME));
      db.poll_votes.push({ poll_id: a.p_poll, option_id: a.p_option, user_id: ME, voted_at: t }); notify('poll_votes', 'INSERT', {}); return ok();
    }
    case 'retract_vote': db.poll_votes = db.poll_votes.filter((v) => !(v.poll_id === a.p_poll && v.user_id === ME)); notify('poll_votes', 'DELETE', null, {}); return ok();
    case 'create_poll': {
      const id = uid();
      db.polls.push({ id, ride_id: a.p_ride, question: a.p_question, kind: a.p_kind, created_by: ME, closes_at: a.p_closes_at, created_at: t });
      a.p_options.forEach((o, i) => db.poll_options.push({ id: uid(), poll_id: id, label: o.label, option_time: o.time || null, position: i }));
      notify('polls', 'INSERT', { id }); return ok(id);
    }
    case 'close_poll': { const p = db.polls.find((x) => x.id === a.p_poll); if (p) p.closes_at = t; notify('polls', 'UPDATE', p); return ok(); }
    case 'share_location': {
      const row = { user_id: ME, lat: a.p_lat, lng: a.p_lng, accuracy_m: a.p_accuracy, ride_id: a.p_ride, share_until: a.p_share_until, updated_at: t };
      const i = db.member_locations.findIndex((x) => x.user_id === ME);
      if (i >= 0) db.member_locations[i] = row; else db.member_locations.push(row);
      notify('member_locations', i >= 0 ? 'UPDATE' : 'INSERT', row); return ok();
    }
    case 'stop_location_sharing': db.member_locations = db.member_locations.filter((x) => x.user_id !== ME); notify('member_locations', 'DELETE', null, { user_id: ME }); return ok();
    case 'resolve_help': { const r = db.help_requests.find((x) => x.id === a.p_request); Object.assign(r, { status: 'resolved', resolved_at: t, resolved_by: ME }); notify('help_requests', 'UPDATE', { ...r }); return ok(); }
    case 'create_invite': {
      const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(10))).map((b) => al[b % 32]).join('');
      const row = { id: uid(), code, note: a.p_note, max_uses: a.p_max_uses, uses: 0, expires_at: new Date(Date.now() + a.p_hours * H).toISOString(), revoked_at: null, created_by: ME, created_at: t };
      db.invites.unshift(row); return ok(row);
    }
    case 'revoke_invite': { const i = db.invites.find((x) => x.id === a.p_invite); if (i) i.revoked_at = t; return ok(); }
    case 'approve_member': { const p = P(a.p_user); p.status = 'active'; notify('profiles', 'UPDATE', { ...p }); return ok(); }
    case 'suspend_member': { const p = P(a.p_user); p.status = 'suspended'; p.role = 'member'; db.member_locations = db.member_locations.filter((x) => x.user_id !== p.id); notify('profiles', 'UPDATE', { ...p }); return ok(); }
    case 'set_admin': { const p = P(a.p_user); p.role = a.p_is_admin ? 'admin' : 'member'; notify('profiles', 'UPDATE', { ...p }); return ok(); }
    case 'renew_listing': { const l = db.listings.find((x) => x.id === a.p_listing && x.user_id === ME); if (!l) return Promise.resolve(err('not_allowed')); l.expires_at = new Date(Date.now() + 30 * D).toISOString(); notify('listings', 'UPDATE', { ...l }); return ok(l.expires_at); }
    case 'check_invite': return ok(true);
    case 'request_join': return ok('active');
    default: return Promise.resolve(err(`${name} غير متاح في المعاينة`));
  }
}

// ---------- التخزين ----------
const files = new Map();
function demoSvg(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#7a4dff"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><text x="320" y="210" font-size="34" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const storage = {
  from: () => ({
    upload: async (path, blob) => { files.set(path, URL.createObjectURL(blob)); return { data: { path }, error: null }; },
    createSignedUrl: async (path) => ({ data: { signedUrl: files.get(path) || demoSvg('صورة تجريبية') }, error: null }),
    remove: async (paths) => { paths.forEach((p) => files.delete(p)); return { data: [], error: null }; },
  }),
};

// ---------- الواجهة العامة ----------
export function createMockClient() {
  const session = { user: { id: ME, email: 'preview@nightriders.local', user_metadata: {} }, access_token: 'preview' };
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => { location.href = location.pathname; return { error: null }; },
      signInWithPassword: async () => ({ data: {}, error: { message: 'غير متاح في وضع المعاينة' } }),
      signUp: async () => ({ data: {}, error: { message: 'غير متاح في وضع المعاينة' } }),
      resetPasswordForEmail: async () => ({ error: { message: 'غير متاح في وضع المعاينة' } }),
      updateUser: async () => ({ error: { message: 'غير متاح في وضع المعاينة' } }),
    },
    from: (t) => new Query(t),
    rpc: (n, a) => rpc(n, a),
    storage,
    channel(name) {
      const ch = { name, listeners: [], on(_type, cfg, cb) { this.listeners.push({ cfg, cb }); return this; },
        subscribe(cb) { channels.add(this); if (cb) setTimeout(() => cb('SUBSCRIBED'), 0); return this; } };
      return ch;
    },
    removeChannel(ch) { channels.delete(ch); return Promise.resolve('ok'); },
  };
}
