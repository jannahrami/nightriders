// الشات: عام + شات لكل طلعة، تحديث مباشر، صور، رسائل صوتية، الرد على رسالة، حالة الإرسال وإعادة المحاولة
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
  const sendBtn = h('button', { class: 'icon-btn send', 'aria-label': 'إرسال', hidden: true }, icon('send'));
  const micBtn = h('button', { class: 'icon-btn send', 'aria-label': 'تسجيل رسالة صوتية' }, icon('mic'));
  const replyBar = h('div', { class: 'reply-bar', hidden: true });
  const recBar = h('div', { class: 'rec-bar', hidden: true });
  const attachBtn = h('button', { class: 'icon-btn', 'aria-label': 'إرفاق صورة', onclick: () => fileIn.click() }, icon('image'));
  const newBelow = h('button', { class: 'btn sm primary', hidden: true, style: { position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 } }, 'رسائل جديدة ↓');
  const liveSlot = h('span');
  const header = topbar({ title: 'الشات', back: rideId ? `#/ride/${rideId}` : null, actions: liveSlot });

  const pageEl = h('div', { class: 'chat-page' },
    h('div', { class: 'chat-channels' }, channels),
    h('div', { style: { position: 'relative', flex: 1, display: 'flex', minHeight: 0 } }, scroll, newBelow),
    replyBar, preview,
    h('div', { class: 'composer' }, attachBtn, text, sendBtn, micBtn, fileIn, recBar));
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

  const snippet = (m) => (m.body ? m.body.slice(0, 90) : m.audio_path || m._audioUrl ? '🎤 رسالة صوتية' : m.image_path || m._localUrl ? '📷 صورة' : '…');
  const replyCache = new Map();   // رسائل أقدم من المحمّلة نجيبها عند الحاجة
  async function fetchReply(id) {
    if (replyCache.has(id)) return;
    replyCache.set(id, null);
    try { const r = await must(state.sb.from('messages').select('*').eq('id', id).maybeSingle()); replyCache.set(id, r || { deleted: true }); render(); }
    catch { replyCache.delete(id); }
  }
  function quote(id) {
    const q = byId.get(id) || replyCache.get(id);
    if (q === undefined) fetchReply(id);
    const who = q && !q.deleted ? (q.user_id === myId() ? 'أنت' : member(q.user_id)?.display_name || 'عضو') : '';
    return h('button', { type: 'button', class: 'quote', onclick: (e) => { e.stopPropagation(); jumpTo(id); } },
      h('b', null, who || 'رسالة'), h('span', null, !q ? '…' : q.deleted ? 'رسالة محذوفة' : snippet(q)));
  }
  function jumpTo(id) {
    const el = scroll.querySelector(`[data-id="${id}"]`);
    if (!el) { toast('الرسالة الأصلية أقدم — اسحب لفوق لتحميل الأقدم', '', 2500); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
  }

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
    const audio = row.audio_path || row._audioUrl ? audioPlayer(row.audio_path, row.audio_ms, row._audioUrl) : null;
    const el = h('div', { class: `msg ${mine ? 'me' : ''} ${cont && !row.reply_to ? 'cont' : ''} ${isPending && row.status === 'failed' ? 'failed' : ''}`, dataset: { id: row.id || row.client_id } },
      avatar(p, 'sm'),
      h('div', null,
        h('div', { class: 'bubble' },
          !mine && (!cont || row.reply_to) ? h('a', { class: 'who', href: `#/member/${row.user_id}`, style: { display: 'block' } }, p?.display_name || 'عضو') : null,
          row.reply_to ? quote(row.reply_to) : null,
          img, audio,
          row.body ? h('div', { class: 'txt' }, row.body) : null,
          h('div', { class: 'meta' }, fmtTime(row.created_at), isPending && row.status !== 'failed' ? status : null),
          !isPending ? h('div', { class: 'acts' },
            h('button', { class: 'act', 'aria-label': 'رد', onclick: (e) => { e.stopPropagation(); startReply(row); } }, icon('reply')),
            canDel ? h('button', { class: 'act', 'aria-label': 'حذف الرسالة', onclick: (e) => { e.stopPropagation(); del(row); } }, icon('trash')) : null) : null),
        isPending && row.status === 'failed' ? status : null));
    if (!isPending) {
      // ضغطة مطوّلة تُظهر الأزرار، والسحب جانبًا = رد
      let t, x0 = null, y0 = null, dx = 0;
      el.addEventListener('touchstart', (e) => {
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0;
        t = setTimeout(() => { scroll.querySelectorAll('.msg.show-acts').forEach((m) => m.classList.remove('show-acts')); el.classList.add('show-acts'); }, 450);
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (x0 == null) return;
        const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
        if (Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) { clearTimeout(t); x0 = null; el.style.transform = ''; return; }
        clearTimeout(t);
        dx = Math.max(-80, Math.min(80, mx));
        if (Math.abs(dx) > 8) el.style.transform = `translateX(${dx * 0.6}px)`;
      }, { passive: true });
      el.addEventListener('touchend', () => {
        clearTimeout(t);
        el.style.transform = '';
        if (x0 != null && Math.abs(dx) > 55) { startReply(row); navigator.vibrate?.(15); }
        x0 = null;
      });
    }
    return el;
  }

  // ---------- الرد ----------
  let replyTo = null;
  function startReply(row) {
    replyTo = row;
    scroll.querySelectorAll('.msg.show-acts').forEach((m) => m.classList.remove('show-acts'));
    const who = row.user_id === myId() ? 'نفسك' : member(row.user_id)?.display_name || 'عضو';
    replyBar.hidden = false;
    replyBar.replaceChildren(icon('reply'), h('div', { class: 'grow', style: { minWidth: 0 } }, h('b', null, `رد على ${who}`), h('div', { class: 'xs muted rb-snip' }, snippet(row))),
      h('button', { class: 'icon-btn', 'aria-label': 'إلغاء الرد', onclick: clearReply }, icon('x')));
    if (!recBar.hidden) return;
    text.focus();
  }
  function clearReply() { replyTo = null; replyBar.hidden = true; replyBar.replaceChildren(); }

  // ---------- مشغّل الصوت ----------
  const fmtDur = (ms) => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function audioPlayer(path, ms, localUrl) {
    const btn = h('button', { type: 'button', class: 'ap-btn', 'aria-label': 'تشغيل الرسالة الصوتية' }, icon('play'));
    const fill = h('div', { class: 'ap-fill' });
    const bar = h('div', { class: 'ap-bar' }, fill);
    const t = h('span', { class: 'ap-time' }, fmtDur(ms));
    let a = null;
    const setIcon = (playing) => { btn.replaceChildren(icon(playing ? 'pause' : 'play')); btn.setAttribute('aria-label', playing ? 'إيقاف' : 'تشغيل الرسالة الصوتية'); };
    const total = () => (a && isFinite(a.duration) && a.duration > 0 ? a.duration : (ms || 1) / 1000);
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!a) {
        btn.classList.add('busy');
        const url = localUrl || await signedUrl(path);
        btn.classList.remove('busy');
        if (!url) { toast('تعذّر تحميل الرسالة الصوتية', 'err'); return; }
        a = new Audio(url); a.preload = 'auto';
        a.ontimeupdate = () => { fill.style.width = `${Math.min(100, (a.currentTime / total()) * 100)}%`; t.textContent = fmtDur(a.currentTime * 1000); };
        a.onended = () => { setIcon(false); fill.style.width = '0%'; t.textContent = fmtDur(ms); };
        a.onpause = () => setIcon(false);
        a.onplay = () => setIcon(true);
      }
      if (a.paused) {
        if (window.__nrAudio && window.__nrAudio !== a) window.__nrAudio.pause();
        window.__nrAudio = a;
        a.play().catch(() => toast('تعذّر تشغيل الصوت على هذا الجهاز', 'err'));
      } else a.pause();
    };
    bar.onclick = (e) => {
      e.stopPropagation();
      if (!a) return;
      const r = bar.getBoundingClientRect();
      const frac = (r.right - e.clientX) / r.width;   // من اليمين (عربي)
      a.currentTime = Math.max(0, Math.min(total() - 0.05, frac * total()));
    };
    return h('div', { class: 'ap' }, btn, bar, t);
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
    syncButtons();
    preview.replaceChildren(h('img', { src: attached.url, alt: '' }), h('div', { class: 'grow small muted' }, 'ستُضغط الصورة قبل الإرسال'),
      h('button', { class: 'icon-btn', 'aria-label': 'إزالة الصورة', onclick: clearAttach }, icon('x')));
  };
  function clearAttach() { attached = null; preview.hidden = true; preview.replaceChildren(); syncButtons(); }

  const autosize = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 140) + 'px'; };
  text.addEventListener('input', autosize);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); compose(); }
  });
  sendBtn.onclick = compose;

  const syncButtons = () => { const empty = !text.value.trim() && !attached; sendBtn.hidden = empty; micBtn.hidden = !empty; };
  text.addEventListener('input', syncButtons);

  // ---------- التسجيل الصوتي ----------
  const MAX_REC_MS = 180000;
  let rec = null;
  micBtn.onclick = startRec;
  async function startRec() {
    if (rec) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('جهازك أو متصفحك ما يدعم التسجيل الصوتي', 'err'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast('ما قدرنا نستخدم المايك. اسمح للتطبيق بالمايك من إعدادات الجوال.', 'err', 6000); return; }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    let mr;
    try { mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined); }
    catch { stream.getTracks().forEach((tr) => tr.stop()); toast('تعذّر بدء التسجيل', 'err'); return; }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec = { mr, stream, chunks, start: Date.now(), timer: null };
    const clock = h('span', { class: 'rec-time' }, '0:00');
    recBar.replaceChildren(
      h('button', { class: 'icon-btn', 'aria-label': 'إلغاء التسجيل', onclick: () => stopRec(false) }, icon('trash')),
      h('div', { class: 'rec-mid' }, h('span', { class: 'rec-dot' }), clock, h('span', { class: 'xs muted' }, 'جارٍ التسجيل…')),
      h('button', { class: 'icon-btn send', 'aria-label': 'إرسال الرسالة الصوتية', onclick: () => stopRec(true) }, icon('send')));
    recBar.hidden = false;
    rec.timer = setInterval(() => {
      const el = Date.now() - rec.start;
      clock.textContent = fmtDur(el);
      if (el >= MAX_REC_MS) { toast('وصلت الحد: 3 دقائق', '', 2500); stopRec(true); }
    }, 250);
    mr.start(250);
  }
  function stopRec(doSend) {
    if (!rec) return;
    const { mr, stream, chunks, start, timer } = rec;
    rec = null;
    clearInterval(timer);
    recBar.hidden = true; recBar.replaceChildren();
    const ms = Date.now() - start;
    mr.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (!doSend) return;
      if (ms < 800 || !chunks.length) { toast('التسجيل قصير جدًا', '', 2000); return; }
      const mime = (mr.mimeType || chunks[0].type || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mime });
      composeAudio(blob, mime, Math.min(ms, MAX_REC_MS));
    };
    try { mr.state !== 'inactive' ? mr.stop() : mr.onstop(); } catch { stream.getTracks().forEach((tr) => tr.stop()); }
  }
  function composeAudio(blob, mime, ms) {
    const pm = { client_id: uuid(), body: null, file: null, audioBlob: blob, audioMime: mime, audio_ms: Math.max(300, ms), audio_path: null,
      _audioUrl: URL.createObjectURL(blob), image_path: null, reply_to: replyTo?.id || null, status: 'sending', user_id: myId(), created_at: new Date().toISOString() };
    pending.set(pm.client_id, pm);
    clearReply();
    render(); toBottom();
    send(pm);
  }

  function compose() {
    const body = text.value.trim();
    if (!body && !attached) return;
    if (body.length > 2000) { toast('الرسالة طويلة (الحد 2000 حرف)', 'err'); return; }
    const pm = { client_id: uuid(), body: body || null, file: attached?.file || null, _localUrl: attached?.url || null,
      image_path: null, reply_to: replyTo?.id || null, status: 'sending', user_id: myId(), created_at: new Date().toISOString() };
    pending.set(pm.client_id, pm);
    text.value = ''; autosize(); clearAttach(); clearReply(); syncButtons();
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
      if (pm.audioBlob && !pm.audio_path) {
        pm.audio_path = await uploadToMyFolder('chat', pm.audioBlob, pm.audioMime, pm.audioMime === 'audio/mp4' ? 'm4a' : pm.audioMime.split('/')[1] || 'webm');
      }
      let row;
      const { data, error } = await state.sb.from('messages')
        .insert({ ride_id: rideId, client_id: pm.client_id, body: pm.body, image_path: pm.image_path,
          audio_path: pm.audio_path || null, audio_ms: pm.audio_path ? Math.round(pm.audio_ms) : null, reply_to: pm.reply_to || null }).select('*').single();
      if (error) {
        if (error.code === '23505') {   // أُرسلت سابقًا (مثلًا انقطع الرد) — لا تكرار
          row = await must(state.sb.from('messages').select('*').eq('user_id', myId()).eq('client_id', pm.client_id).single());
        } else throw error;
      } else row = data;
      pending.delete(pm.client_id);
      if (pm._localUrl) URL.revokeObjectURL(pm._localUrl);
      if (pm._audioUrl) { setTimeout(() => URL.revokeObjectURL(pm._audioUrl), 60000); }
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
      const files = [row.image_path, row.audio_path].filter(Boolean);
      if (files.length) removeFiles(files).catch(() => {});
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
  scroll.addEventListener('click', () => scroll.querySelectorAll('.msg.show-acts').forEach((m) => m.classList.remove('show-acts')));
  return () => { stopRec(false); window.__nrAudio?.pause(); state.sb.removeChannel(ch); offs.forEach((f) => f()); unfit(); };
}
