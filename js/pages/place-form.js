// إضافة / تعديل محل في الدليل
import { h, mount, icon, topbar, loadingView, errorView, emptyView, toast, errMsg, PLACE_CAT } from '../ui.js';
import { state, must, myId, isAdmin } from '../core.js';
import { pickPoint } from '../geo.js';

export default async function placeForm(root, [a]) {
  // المسارات: places/new/<cat>  أو  place/<id>/edit
  const editing = !PLACE_CAT[a] && a && a !== 'new' ? a : null;
  const body = h('div', { class: 'content' }, loadingView());
  mount(root, topbar({ title: editing ? 'تعديل المحل' : 'أضف محل', back: '#/places' + (PLACE_CAT[a] ? `/${a}` : '') }), body);

  let r = null;
  if (editing) {
    try { r = await must(state.sb.from('places').select('*').eq('id', editing).maybeSingle()); }
    catch (e) { mount(body, errorView(e, () => placeForm(root, [a]))); return; }
    if (!r || !(r.created_by === myId() || isAdmin())) { mount(body, emptyView('pin', 'لا يمكنك تعديل هذا المحل')); return; }
  }

  const field = (label, el, hint) => h('div', { class: 'field' }, h('label', null, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
  let cat = (editing && r?.category) || (PLACE_CAT[a] ? a : 'repair');
  let point = r ? { lat: r.lat, lng: r.lng } : null;
  let pre = null;
  if (!editing) { try { pre = JSON.parse(sessionStorage.getItem('nr_place_prefill') || 'null'); } catch { /* */ } sessionStorage.removeItem('nr_place_prefill'); }
  if (pre) { point = { lat: pre.lat, lng: pre.lng }; r = { name: pre.name, phone: pre.phone, hours: pre.hours }; }
  const catRow = h('div', { class: 'picker-row' });
  const drawCats = () => catRow.replaceChildren(...Object.entries(PLACE_CAT).map(([k, t]) =>
    h('button', { type: 'button', class: 'pick' + (cat === k ? ' on' : ''), onclick: () => { cat = k; drawCats(); } }, t)));
  drawCats();
  const name = h('input', { class: 'input', maxlength: 80, value: r?.name || '', placeholder: 'مثال: ورشة أبو علي للدبابات' });
  const phone = h('input', { class: 'input', type: 'tel', inputmode: 'tel', dir: 'ltr', maxlength: 20, value: r?.phone || '', placeholder: '05XXXXXXXX' });
  const hours = h('input', { class: 'input', maxlength: 80, value: r?.hours || '', placeholder: 'مثال: يوميًا 4 العصر – 12 الليل' });
  const notes = h('textarea', { class: 'textarea', maxlength: 500, placeholder: 'وش يميّزه؟ مثال: يفهم في الهارلي، أسعاره معقولة' }, r?.notes || '');
  const ptText = h('div', { class: 'small muted' });
  const drawPt = () => { ptText.textContent = point ? `✓ تم تحديد الموقع (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})` : 'لم يُحدد الموقع بعد'; };
  drawPt();
  const pickBtn = h('button', { class: 'btn block', type: 'button', onclick: async () => {
    const p = await pickPoint({ title: 'موقع المحل', initial: point || undefined });
    if (p) { point = { lat: p.lat, lng: p.lng }; if (p.label && !name.value.trim()) name.value = p.label; drawPt(); }
  } }, icon('pin'), 'حدد الموقع على الخريطة');

  const err = h('div', { class: 'form-error', hidden: true });
  const save = h('button', { class: 'btn primary block lg', type: 'submit' }, editing ? 'حفظ' : 'أضف للدليل');
  const form = h('form', { class: 'stack-lg', novalidate: true },
    h('div', { class: 'card stack' }, field('النوع', catRow), field('الموقع', h('div', { class: 'stack', style: { gap: '6px' } }, pickBtn, ptText), 'ابحث بالاسم أو حرّك الخريطة أو الصق رابط Google Maps'), field('اسم المحل', name)),
    h('div', { class: 'card stack' }, field('رقم التواصل (اختياري)', phone), field('أوقات الدوام (اختياري)', hours), field('ملاحظات للشباب (اختياري)', notes)),
    err, save);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (save.classList.contains('busy')) return;
    const fail = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    err.hidden = true;
    const n = name.value.trim();
    const ph = phone.value.replace(/[^\d+ ]/g, '').trim();
    if (!point) return fail('حدد موقع المحل على الخريطة.');
    if (n.length < 2) return fail('اكتب اسم المحل.');
    if (ph && !/^\+?[0-9 ]{7,20}$/.test(ph)) return fail('رقم التواصل غير صحيح.');
    save.classList.add('busy');
    try {
      const row = { category: cat, name: n, phone: ph || null, hours: hours.value.trim() || null, notes: notes.value.trim() || null, lat: point.lat, lng: point.lng };
      if (editing) {
        const d = await must(state.sb.from('places').update(row).eq('id', editing).select('id'));
        if (!d.length) throw new Error('not_allowed');
      } else await must(state.sb.from('places').insert(row).select('id'));
      toast(editing ? 'تم الحفظ' : 'تمت الإضافة — شكرًا لك', 'ok');
      location.hash = `#/places/${cat}`;
    } catch (ex) { fail(errMsg(ex)); }
    finally { save.classList.remove('busy'); }
  };
  mount(body, form);
}
