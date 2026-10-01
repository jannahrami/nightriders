// إضافة / تعديل إعلان في السوق
import { h, mount, icon, topbar, loadingView, errorView, emptyView, toast, errMsg, MARKET_CAT, CONDITION } from '../ui.js';
import { state, brand, must, myId } from '../core.js';
import { compressImage, uploadToMyFolder, removeFiles, signedUrl, IMAGE_INPUT } from '../media.js';

const MAX_PHOTOS = 5;

export default async function listingForm(root, [id]) {
  const body = h('div', { class: 'content' }, loadingView());
  mount(root, topbar({ title: id ? 'تعديل الإعلان' : 'إعلان جديد', back: id ? `#/market/${id}` : '#/market' }), body);

  let r = null;
  if (id) {
    try { r = await must(state.sb.from('listings').select('*').eq('id', id).maybeSingle()); }
    catch (e) { mount(body, errorView(e, () => listingForm(root, [id]))); return; }
    if (!r || r.user_id !== myId()) { mount(body, emptyView('tag', 'لا يمكنك تعديل هذا الإعلان')); return; }
  }

  const field = (label, el, hint) => h('div', { class: 'field' }, h('label', null, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
  const title = h('input', { class: 'input', maxlength: 80, value: r?.title || '', placeholder: 'مثال: هارلي ستريت قلايد 2019' });
  const price = h('input', { class: 'input', type: 'text', inputmode: 'numeric', dir: 'ltr', maxlength: 9, value: r?.price ?? '', placeholder: 'اتركه فاضي = على السوم' });
  const city = h('input', { class: 'input', maxlength: 40, value: r?.city ?? state.me?.city ?? '', placeholder: brand().city });
  const desc = h('textarea', { class: 'textarea', maxlength: 2000, placeholder: 'الموديل، الممشى، الحالة، الإضافات، سبب البيع…' }, r?.description || '');

  let cat = r?.category || null, cond = r?.condition || null;
  const catRow = h('div', { class: 'picker-row' }), condRow = h('div', { class: 'picker-row' });
  const drawPicks = () => {
    catRow.replaceChildren(...Object.entries(MARKET_CAT).map(([k, t]) => h('button', { type: 'button', class: 'pick' + (cat === k ? ' on' : ''), onclick: () => { cat = k; drawPicks(); } }, t)));
    condRow.replaceChildren(...Object.entries(CONDITION).map(([k, t]) => h('button', { type: 'button', class: 'pick' + (cond === k ? ' on' : ''), onclick: () => { cond = k; drawPicks(); } }, t)));
  };
  drawPicks();

  // الصور: عناصر موجودة {path} أو جديدة {file}
  let photos = (r?.photos || []).map((path) => ({ path }));
  const removed = [];
  const photoGrid = h('div', { class: 'mk-photos' });
  const input = h('input', { type: 'file', accept: IMAGE_INPUT, multiple: true, hidden: true });
  input.onchange = () => {
    const files = [...input.files]; input.value = '';
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast(`الحد ${MAX_PHOTOS} صور — أُضيف أول ${room}`, 'err');
    files.slice(0, room).forEach((file) => photos.push({ file, url: URL.createObjectURL(file) }));
    drawPhotos();
  };
  function drawPhotos() {
    photoGrid.replaceChildren(
      ...photos.map((p, i) => {
        const img = h('img', { alt: '' });
        if (p.url) img.src = p.url; else signedUrl(p.path).then((u) => { if (u) img.src = u; });
        return h('div', { class: 'mk-ph' }, img,
          i === 0 ? h('span', { class: 'mk-cover' }, 'الغلاف') : null,
          h('button', { type: 'button', class: 'mk-rm', 'aria-label': 'إزالة الصورة', onclick: () => {
            const [x] = photos.splice(i, 1); if (x.path) removed.push(x.path); drawPhotos();
          } }, icon('x')));
      }),
      photos.length < MAX_PHOTOS ? h('button', { type: 'button', class: 'mk-add', onclick: () => input.click() }, icon('camera'), h('span', null, 'أضف صور')) : null);
  }
  drawPhotos();

  const err = h('div', { class: 'form-error', hidden: true });
  const save = h('button', { class: 'btn primary block lg', type: 'submit' }, id ? 'حفظ التعديل' : 'نشر الإعلان');
  const form = h('form', { class: 'stack-lg', novalidate: true },
    h('div', { class: 'card stack' }, h('div', { class: 'h3' }, `الصور (حتى ${MAX_PHOTOS})`), photoGrid, input,
      h('div', { class: 'xs muted' }, 'أول صورة هي الغلاف. الصور تُضغط قبل الرفع ولا يشوفها إلا أعضاء القروب.')),
    h('div', { class: 'card stack' },
      field('العنوان', title),
      field('التصنيف', catRow),
      field('الحالة', condRow),
      field('السعر (ريال)', price),
      field('المدينة', city),
      field('الوصف', desc)),
    err, save);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (save.classList.contains('busy')) return;
    err.hidden = true;
    const t = title.value.trim();
    const pr = price.value.replace(/[^\d]/g, '');
    const fail = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    if (t.length < 2) return fail('اكتب عنوان للإعلان.');
    if (!cat) return fail('اختر التصنيف.');
    if (!cond) return fail('اختر الحالة: جديد أو مستعمل.');
    if (pr && Number(pr) > 10000000) return fail('السعر غير منطقي.');
    save.classList.add('busy'); save.textContent = 'جارٍ الحفظ…';
    const uploaded = [];
    try {
      const paths = [];
      for (const p of photos) {
        if (p.path) { paths.push(p.path); continue; }
        const { blob } = await compressImage(p.file, 1600, 0.82);
        const path = await uploadToMyFolder('market', blob, 'image/jpeg', 'jpg');
        uploaded.push(path); paths.push(path);
      }
      const row = { title: t, price: pr ? Number(pr) : null, category: cat, condition: cond,
        description: desc.value.trim() || null, city: city.value.trim() || null, photos: paths };
      let saved;
      if (id) {
        saved = await must(state.sb.from('listings').update(row).eq('id', id).select('id'));
        if (!saved.length) throw new Error('not_allowed');
        if (removed.length) removeFiles(removed).catch(() => {});
      } else {
        saved = await must(state.sb.from('listings').insert(row).select('id'));
      }
      toast(id ? 'تم حفظ التعديل' : 'تم نشر الإعلان', 'ok');
      location.hash = `#/market/${saved[0].id}`;
    } catch (ex) {
      if (uploaded.length) removeFiles(uploaded).catch(() => {});
      fail(ex.message && /[؀-ۿ]/.test(ex.message) ? ex.message : errMsg(ex));
    } finally { save.classList.remove('busy'); save.textContent = id ? 'حفظ التعديل' : 'نشر الإعلان'; }
  };
  mount(body, form);
}
