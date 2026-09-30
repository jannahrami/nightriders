// ألبوم الطلعة: صور ومقاطع خاصة بالأعضاء
import { h, mount, icon, topbar, loadingView, errorView, emptyView, fmtDateShort, fmtRelative, confirmDialog, toast, errMsg } from '../ui.js';
import { state, must, myId, member, isAdmin } from '../core.js';
import { compressImage, uploadToMyFolder, removeFiles, signedUrl, IMAGE_INPUT, VIDEO_TYPES, MAX_VIDEO_BYTES } from '../media.js';

export default async function albumPage(root, [rideId]) {
  const grid = h('div', { class: 'album' });
  const status = h('div', { class: 'stack', style: { gap: '8px' } });
  const input = h('input', { type: 'file', accept: `${IMAGE_INPUT},${VIDEO_TYPES.join(',')}`, multiple: true, hidden: true });
  const title = h('div', { class: 'small muted' });
  mount(root, topbar({ title: 'ألبوم الطلعة', back: `#/ride/${rideId}` }), h('div', { class: 'content stack' },
    title,
    h('button', { class: 'btn primary block', onclick: () => input.click() }, icon('camera'), 'أضف صورًا أو مقاطع'),
    h('div', { class: 'xs muted' }, 'الصور تُضغط تلقائيًا قبل الرفع. المقاطع: MP4 أو MOV أو WebM بحد أقصى 50MB ولا تُضغط. الملفات خاصة ولا يراها إلا الأعضاء المقبولون.'),
    status, input, grid));

  let items = [];
  async function load() {
    mount(grid, loadingView());
    try {
      const ride = await must(state.sb.from('rides').select('title').eq('id', rideId).maybeSingle());
      title.textContent = ride ? ride.title : '';
      items = await must(state.sb.from('ride_media').select('*').eq('ride_id', rideId).order('created_at', { ascending: false }));
      if (!items.length) { mount(grid, h('div', { style: { gridColumn: '1 / -1' } }, emptyView('album', 'الألبوم فارغ', 'كن أول من يضيف صور الطلعة.'))); return; }
      mount(grid, ...items.map((m, i) => {
        const tile = h('button', { class: 'tile', 'aria-label': `عرض ملف ${i + 1}`, onclick: () => view(i) });
        signedUrl(m.path).then((u) => {
          if (!u) return;
          tile.prepend(m.kind === 'image' ? h('img', { src: u, alt: '', loading: 'lazy' }) : h('video', { src: u + '#t=0.1', muted: true, playsinline: true, preload: 'metadata' }));
        });
        if (m.kind === 'video') tile.appendChild(h('span', { class: 'vid' }, '▶ فيديو'));
        return tile;
      }));
    } catch (e) { mount(grid, h('div', { style: { gridColumn: '1 / -1' } }, errorView(e, load))); }
  }

  input.onchange = async () => {
    const files = [...input.files];
    input.value = '';
    for (const f of files) await uploadOne(f);
    load();
  };

  async function uploadOne(f) {
    const isVideo = VIDEO_TYPES.includes(f.type);
    const isImage = /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name);
    const line = h('div', { class: 'card small', style: { padding: '10px 12px' } });
    const label = h('span', null, f.name);
    const bar = h('div', { class: 'upload-progress' }, h('div', { style: { width: '35%' } }));
    line.append(h('div', { class: 'row between' }, label, h('div', { class: 'spinner sm' })), bar);
    status.appendChild(line);
    const done = (ok, msg) => { line.replaceChildren(h('div', { class: ok ? 'form-ok' : 'form-error' }, `${f.name}: ${msg}`)); setTimeout(() => line.remove(), ok ? 2500 : 8000); };
    try {
      if (!isVideo && !isImage) throw new Error('نوع غير مدعوم. المسموح: صور JPEG/PNG/WebP/HEIC أو فيديو MP4/MOV/WebM.');
      if (isVideo && f.size > MAX_VIDEO_BYTES) throw new Error('المقطع أكبر من 50MB. قصّه أو اضغطه من الجوال ثم أعد المحاولة.');
      let blob = f, mime = f.type, ext = (f.name.split('.').pop() || 'mp4').toLowerCase();
      if (isImage) { ({ blob } = await compressImage(f, 2048, 0.84)); mime = 'image/jpeg'; ext = 'jpg'; }
      else if (mime === 'video/quicktime') ext = 'mov';
      bar.firstChild.style.width = '70%';
      const path = await uploadToMyFolder(`rides/${rideId}`, blob, mime, ext);
      try {
        await must(state.sb.from('ride_media').insert({ ride_id: rideId, path, kind: isImage ? 'image' : 'video', mime, size_bytes: blob.size }));
      } catch (e) { removeFiles([path]).catch(() => {}); throw e; }
      done(true, 'تم الرفع');
    } catch (e) { done(false, e.message && /[؀-ۿ]/.test(e.message) ? e.message : errMsg(e)); }
  }

  function view(i) {
    const m = items[i];
    if (!m) return;
    const p = member(m.user_id);
    const canDel = m.user_id === myId() || isAdmin();
    const media = h('div', { class: 'vbody' }, h('div', { class: 'spinner' }));
    const v = h('div', { class: 'viewer', role: 'dialog' },
      h('div', { class: 'vbar' },
        h('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => close() }, icon('x')),
        h('div', { class: 'grow small' }, h('b', null, p?.display_name || 'عضو'), h('div', { class: 'xs muted' }, `${fmtDateShort(m.created_at)} · ${fmtRelative(m.created_at)}`)),
        i > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'السابق', onclick: () => { close(); view(i - 1); } }, icon('back')) : null,
        i < items.length - 1 ? h('button', { class: 'icon-btn', 'aria-label': 'التالي', style: { transform: 'scaleX(-1)' }, onclick: () => { close(); view(i + 1); } }, icon('back')) : null,
        canDel ? h('button', { class: 'icon-btn', 'aria-label': 'حذف', onclick: async () => {
          if (!(await confirmDialog(m.user_id === myId() ? 'حذف ملفك من الألبوم؟' : 'حذف هذا الملف كأدمن؟', { danger: true, ok: 'حذف' }))) return;
          try {
            const d = await must(state.sb.from('ride_media').delete().eq('id', m.id).select('id'));
            if (!d.length) throw new Error('not_allowed');
            await removeFiles([m.path]).catch(() => {});
            toast('تم الحذف', 'ok'); close(); load();
          } catch (e) { toast(errMsg(e), 'err'); }
        } }, icon('trash')) : null),
      media);
    const close = () => { v.remove(); window.removeEventListener('hashchange', close); };
    window.addEventListener('hashchange', close);
    document.body.appendChild(v);
    signedUrl(m.path).then((u) => {
      if (!u) { media.replaceChildren(h('div', { class: 'muted' }, 'تعذّر تحميل الملف')); return; }
      media.replaceChildren(m.kind === 'image' ? h('img', { src: u, alt: '' }) : h('video', { src: u, controls: true, playsinline: true, autoplay: true }));
    });
  }

  load();
  const ch = state.sb.channel('album-' + rideId + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_media', filter: `ride_id=eq.${rideId}` }, load).subscribe();
  return () => state.sb.removeChannel(ch);
}
