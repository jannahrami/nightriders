// الشات: عام + شات لكل طلعة، تحديث مباشر، صور، حالة الإرسال وإعادة المحاولة
import { h, mount, icon, topbar, fitToViewport, loadingView, errorView, emptyView, fmtTime, fmtDate, dayKey, confirmDialog, toast, errMsg, uuid } from '../ui.js';
import { state, must, myId, member, isAdmin, on, liveHint } from '../core.js';
import { avatar, compressImage, uploadToMyFolder, removeFiles, privateImg, IMAGE_INPUT, signedUrl } from '../media.js';

const PAGE = 30;

export default async function chatPage(root, params) {
  const rideId = params[0] || null;
  const channels = h('div', { class: 'tabs' });
  const scroll = h('div', { class: 'chat-scroll', role: 'log', 'aria-live': 'polite' });
  const text = h('textarea', { class: 'textarea', rows: 1, maxlength: 2000, placeholder: 'اكتب رسالة…', 'aria-label': 'نص الرسالة' });
  const fileIn = h('input', { type: 'file', accept: IMAGE_INPUT, hidden: true });
  const preview = h('div', { class: 'composer-preview', hidden: true });
  const sendBtn = h('button', { class: 'icon-btn send', 'aria-label': 'إرسال' }, icon('send'));
  const attachBtn = h('button', { class: 'icon-btn', 'aria-label': 'إرفاق صورة', onclick: () => fileIn.click() }, icon('image'));
  const newBelow = h('button', { class: 'btn sm primary', hidden: true, style: { position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 } }, 'رسائل جديدة ↓');
  const liveSlot = h('span');
  const header = topbar({ title: 'الشات', back: rideId ? `#/ride/${rideId}` : null, actions: liveSlot });

  const pageEl = h('div', { class: 'chat-page' },
    h('div', { class: 'chat-channels' }, channels),
    h('div', { style: { position: 'relative', flex: 1, display: 'flex', minHeight: 0 } }, scroll, newBelow),
    preview,
    h('div', { class: 'composer' }, attachBtn, text, sendBtn, fileIn));
  mount(root, header, pageEl);
  const unfit = fitToViewport(pageEl);

  // ---------- القنوات ----------
  (async () => {
    try {
      const rides = await must(state.sb.from('rides').select('id,title,status,meet_at').in('status', ['planned', 'ongoing']).order('meet_at').limit(10));
      if (rideId && !rides.some((r) => r.id === rideId)) {
        const r = await must(state.sb.from('rides').select('id,title,status,meet_at').eq('id', rideId).maybeSingle());
        if (r) rides.unshift(r);
      }
      const cur = rides.find((r) => r.id === rideId);
      if (cur) header.querySelector('.title').textContent = `شات: ${cur.title}`;
      channels.replaceChildren(
        h('a', { class: 'tab' + (!rideId ? ' on' : ''), href: '#/chat' }, 'العام'),
        ...rides.map((r) => h('a', { class: 'tab' + (r.id === rideId ? ' on' : ''), href: `#/chat/${r.id}` }, r.title)));
    } catch { channels.replaceChildren(h('a', { class: 'tab on', href: '#/chat' }, 'العام')); }
  })();

  // ---------- الرسائل ----------
  const msgs = [];                 // مرتبة تصاعديًا
  const byId = new Map();
  const pending = new Map();       // client_id -> {client_id, body, file, image_path, status, error, created_at}
  let hasMore = true, loadingOlder = false;

  const inChannel = (row) => (rideId ? row.ride_id === rideId : row.ride_id == null);
  const nearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
  const toBottom = () => { scroll.scrollTop = scroll.scrollHeight; newBelow.hidden = true; };
  newBelow.onclick = toBottom;
  scroll.addEventListener('scroll', () => {
    if (nearBottom()) newBelow.hidden = true;
    if (scroll.scrollTop < 60 && hasMore && !loadingOlder && msgs.length) loadOlder();
  });

  function bubble(row, prev, isPending) {
    const mine = row.user_id === myId();
    const p = member(row.user_id);
    const cont = prev && prev.user_id === row.user_id && new Date(row.created_at) - new Date(prev.created_at) < 5 * 60000 && dayKey(prev.created_at) === dayKey(row.created_at);
    const canDel = !isPending && (mine || isAdmin());
    const img = row.image_path
      ? h('div', { class: 'img', onclick: () => viewImage(row.image_path) }, privateImg(row.image_path))
      : row._localUrl ? h('div', { class: 'img' }, h('img', { src: row._localUrl, alt: '' })) : null;
    let status = null;
    if (isPending) {
      status = row.status === 'failed'
        ? h('div', { class: 'msg-status' }, 'فشل الإرسال', h('button', { class: 'btn sm', onclick: () => send(row) }, icon('refresh'), 'إعادة المحاولة'),
            h('button', { class: 'btn sm ghost', onclick: () => { pending.delete(row.client_id); render(); } }, 'إلغاء'))
        : h('span', null, '· جارٍ الإرسال…');
    }
    const el = h('div', { class: `msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''} ${isPending && row.status === 'failed' ? 'failed' : ''}`, dataset: { id: row.id || row.client_id } },
      avatar(p, 'sm'),
      h('div', null,
        h('div', { class: 'bubble' },
          !mine && !cont ? h('a', { class: 'who', href: `#/member/${row.user_id}`, style: { display: 'block' } }, p?.display_name || 'عضو') : null,
          img,
          row.body ? h('div', { class: 'txt' }, row.body) : null,
          h('div', { class: 'meta' }, fmtTime(row.created_at), isPending && row.status !== 'failed' ? status : null),
          canDel ? h('button', { class: 'del', 'aria-label': 'حذف الرسالة', onclick: (e) => { e.stopPropagation(); del(row); } }, icon('trash')) : null),
        isPending && row.status === 'failed' ? status : null));
    if (canDel) {
      let t; el.addEventListener('touchstart', () => { t = setTimeout(() => el.classList.add('show-del'), 450); }, { passive: true });
      el.addEventListener('touchend', () => clearTimeout(t));
    }
    return el;
  }

  function render() {
    const keep = nearBottom();
    const nodes = [];
    if (hasMore && msgs.length) nodes.push(h('button', { class: 'btn sm ghost', style: { alignSelf: 'center' }, onclick: loadOlder }, 'تحميل رسائل أقدم'));
    if (!hasMore && msgs.length) nodes.push(h('div', { class: 'day-sep' }, 'بداية المحادثة'));
    let prev = null, lastDay = null;
    const all = [...msgs.map((m) => [m, false]), ...[...pending.values()].map((m) => [m, true])];
    for (const [m, isP] of all) {
      const dk = dayKey(m.created_at);
      if (dk !== lastDay) { nodes.push(h('div', { class: 'day-sep' }, fmtDate(m.created_at))); lastDay = dk; prev = null; }
      nodes.push(bubble(m, prev, isP));
      prev = m;
    }
    if (!all.length) nodes.push(emptyView('chat', 'لا توجد رسائل بعد', 'ابدأ السوالف 👋'));
    scroll.replaceChildren(...nodes);
    if (keep) toBottom();
  }

  function addRow(row) {
    if (byId.has(row.id)) return false;
    byId.set(row.id, row);
    const i = msgs.findIndex((m) => m.created_at > row.created_at);
    if (i === -1) msgs.push(row); else msgs.splice(i, 0, row);
    return true;
  }

  function query() {
    let q = state.sb.from('messages').select('*');
    q = rideId ? q.eq('ride_id', rideId) : q.is('ride_id', null);
    return q.order('created_at', { ascending: false }).limit(PAGE);
  }

  async function loadInitial() {
    scroll.replaceChildren(loadingView());
    try {
      const rows = await must(query());
      msgs.length = 0; byId.clear();
      rows.reverse().forEach(addRow);
      hasMore = rows.length === PAGE;
      render(); toBottom();
    } catch (e) { scroll.replaceChildren(errorView(e, loadInitial)); }
  }

  async function loadOlder() {
    if (loadingOlder || !hasMore || !msgs.length) return;
    loadingOlder = true;
    const before = scroll.scrollHeight - scroll.scrollTop;
    try {
      let q = state.sb.from('messages').select('*');
      q = rideId ? q.eq('ride_id', rideId) : q.is('ride_id', null);
      const rows = await must(q.lt('created_at', msgs[0].created_at).order('created_at', { ascending: false }).limit(PAGE));
      rows.forEach(addRow);
      hasMore = rows.length === PAGE;
      render();
      scroll.scrollTop = scroll.scrollHeight - before;
    } catch (e) { toast(errMsg(e), 'err'); }
    finally { loadingOlder = false; }
  }

  // ---------- الإرسال ----------
  let attached = null; // {file, url}
  fileIn.onchange = () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) { toast('الصور فقط في الشات (JPEG/PNG/WebP/HEIC)', 'err'); return; }
    if (attached) URL.revokeObjectURL(attached.url);
    attached = { file: f, url: URL.createObjectURL(f) };
    preview.hidden = false;
    preview.replaceChildren(h('img', { src: attached.url, alt: '' }), h('div', { class: 'grow small muted' }, 'ستُضغط الصورة قبل الإرسال'),
      h('button', { class: 'icon-btn', 'aria-label': 'إزالة الصورة', onclick: clearAttach }, icon('x')));
  };
  function clearAttach() { attached = null; preview.hidden = true; preview.replaceChildren(); }

  const autosize = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 140) + 'px'; };
  text.addEventListener('input', autosize);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); compose(); }
  });
  sendBtn.onclick = compose;

  function compose() {
    const body = text.value.trim();
    if (!body && !attached) return;
    if (body.length > 2000) { toast('الرسالة طويلة (الحد 2000 حرف)', 'err'); return; }
    const pm = { client_id: uuid(), body: body || null, file: attached?.file || null, _localUrl: attached?.url || null,
      image_path: null, status: 'sending', user_id: myId(), created_at: new Date().toISOString() };
    pending.set(pm.client_id, pm);
    text.value = ''; autosize(); clearAttach();
    render(); toBottom();
    send(pm);
  }

  async function send(pm) {
    if (pm.inflight) return;           // يمنع الإرسال المزدوج لنفس الرسالة
    pm.inflight = true; pm.status = 'sending'; render();
    try {
      if (pm.file && !pm.image_path) {
        const { blob } = await compressImage(pm.file, 1600, 0.8);
        pm.image_path = await uploadToMyFolder('chat', blob, 'image/jpeg', 'jpg');
      }
      let row;
      const { data, error } = await state.sb.from('messages')
        .insert({ ride_id: rideId, client_id: pm.client_id, body: pm.body, image_path: pm.image_path }).select('*').single();
      if (error) {
        if (error.code === '23505') {   // أُرسلت سابقًا (مثلًا انقطع الرد) — لا تكرار
          row = await must(state.sb.from('messages').select('*').eq('user_id', myId()).eq('client_id', pm.client_id).single());
        } else throw error;
      } else row = data;
      pending.delete(pm.client_id);
      if (pm._localUrl) URL.revokeObjectURL(pm._localUrl);
      addRow(row);
      render();
    } catch (e) {
      pm.status = 'failed'; pm.error = errMsg(e);
      toast(pm.error, 'err');
      render();
    } finally { pm.inflight = false; }
  }

  async function del(row) {
    const mine = row.user_id === myId();
    if (!(await confirmDialog(mine ? 'حذف رسالتك؟' : 'حذف هذه الرسالة كأدمن؟', { ok: 'حذف', danger: true }))) return;
    try {
      const d = await must(state.sb.from('messages').delete().eq('id', row.id).select('id'));
      if (!d.length) throw new Error('not_allowed');
      if (row.image_path) removeFiles([row.image_path]).catch(() => {});
      byId.delete(row.id);
      const i = msgs.findIndex((m) => m.id === row.id); if (i >= 0) msgs.splice(i, 1);
      render(); toast('تم الحذف', 'ok', 1500);
    } catch (e) { toast(errMsg(e), 'err'); }
  }

  async function viewImage(path) {
    const url = await signedUrl(path);
    if (!url) { toast('تعذّر فتح الصورة', 'err'); return; }
    const v = h('div', { class: 'viewer', role: 'dialog' },
      h('div', { class: 'vbar' }, h('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => v.remove() }, icon('x'))),
      h('div', { class: 'vbody', onclick: (e) => { if (e.target === e.currentTarget) v.remove(); } }, h('img', { src: url, alt: '' })));
    document.body.appendChild(v);
    const off = () => { v.remove(); window.removeEventListener('hashchange', off); };
    window.addEventListener('hashchange', off);
  }

  await loadInitial();
  const filter = rideId ? { filter: `ride_id=eq.${rideId}` } : {};
  const ch = state.sb.channel('chat-' + (rideId || 'general') + Date.now())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', ...filter }, (p) => {
      const row = p.new;
      if (!inChannel(row)) return;
      if (row.user_id === myId() && pending.has(row.client_id)) { pending.delete(row.client_id); }
      const wasNear = nearBottom();
      if (addRow(row)) { render(); if (!wasNear && row.user_id !== myId()) newBelow.hidden = false; }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
      const id = p.old?.id;
      if (id && byId.has(id)) { byId.delete(id); const i = msgs.findIndex((m) => m.id === id); if (i >= 0) msgs.splice(i, 1); render(); }
    })
    .subscribe();
  const drawLive = () => liveSlot.replaceChildren(liveHint() || '');
  drawLive();
  const offs = [on('net', drawLive), on('members', render)];
  return () => { state.sb.removeChannel(ch); offs.forEach((f) => f()); unfit(); };
}
