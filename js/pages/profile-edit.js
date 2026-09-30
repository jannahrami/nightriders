// تعديل ملف البايكر ورقم التواصل
import { h, mount, icon, topbar, loadingView, errorView, toast, errMsg, STYLE } from '../ui.js';
import { state, must, myId } from '../core.js';
import { avatar, compressImage, uploadToMyFolder, removeFiles, privateImg, IMAGE_INPUT } from '../media.js';

export default async function profileEdit(root) {
  const body = h('div', { class: 'content' }, loadingView());
  mount(root, topbar({ title: 'تعديل الملف', back: '#/me' }), body);
  let contact;
  try { contact = await must(state.sb.from('member_contacts').select('*').eq('user_id', myId()).maybeSingle()); }
  catch (e) { mount(body, errorView(e, () => profileEdit(root))); return; }

  const me = state.me;
  const field = (label, el, hint) => h('div', { class: 'field' }, h('label', null, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
  const name = h('input', { class: 'input', maxlength: 40, value: me.display_name });
  const city = h('input', { class: 'input', maxlength: 40, value: me.city || '', placeholder: 'الرياض' });
  const bikeType = h('input', { class: 'input', maxlength: 40, value: me.bike_type || '', placeholder: 'مثال: Harley-Davidson' });
  const bikeModel = h('input', { class: 'input', maxlength: 40, value: me.bike_model || '', placeholder: 'مثال: Street Glide 2022' });
  let style = me.riding_style || null;
  const styleRow = h('div', { class: 'picker-row' });
  const drawStyle = () => styleRow.replaceChildren(...Object.entries(STYLE).map(([k, t]) =>
    h('button', { type: 'button', class: 'pick' + (style === k ? ' on' : ''), onclick: () => { style = style === k ? null : k; drawStyle(); } }, t)));
  drawStyle();
  const phone = h('input', { class: 'input', type: 'tel', inputmode: 'tel', dir: 'ltr', maxlength: 20, value: contact?.phone || '', placeholder: '+9665XXXXXXXX' });
  const showPhone = h('input', { type: 'checkbox', checked: !!contact?.show_phone });

  // الصور
  const pics = { avatar: { file: null, remove: false }, bike: { file: null, remove: false } };
  const picBox = (key, label, currentPath, round) => {
    const input = h('input', { type: 'file', accept: IMAGE_INPUT });
    const thumb = h('div', { style: { width: round ? '64px' : '96px', height: '64px', borderRadius: round ? '50%' : '12px', overflow: 'hidden', background: 'var(--surface-2)', flex: 'none' } });
    const drawThumb = () => {
      const st = pics[key];
      if (st.file) thumb.replaceChildren(h('img', { src: URL.createObjectURL(st.file), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
      else if (currentPath && !st.remove) thumb.replaceChildren(key === 'avatar' ? avatar(me, 'lg') : privateImg(currentPath, { style: { width: '100%', height: '100%', objectFit: 'cover' } }));
      else thumb.replaceChildren(h('div', { class: 'map-fallback', style: { padding: 0 } }, icon('camera')));
      rm.hidden = !(st.file || (currentPath && !st.remove));
    };
    const rm = h('button', { class: 'btn sm ghost', type: 'button', onclick: (e) => { e.preventDefault(); pics[key].file = null; pics[key].remove = true; drawThumb(); } }, 'إزالة');
    input.onchange = () => { const f = input.files[0]; if (f) { pics[key].file = f; pics[key].remove = false; drawThumb(); } input.value = ''; };
    const box = h('label', { class: 'upload-box' }, thumb, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, label), h('div', { class: 'xs muted' }, 'اضغط للاختيار — تُضغط قبل الرفع')), input, rm);
    drawThumb();
    return box;
  };

  const err = h('div', { class: 'form-error', hidden: true });
  const save = h('button', { class: 'btn primary block lg', type: 'submit' }, 'حفظ');
  const form = h('form', { class: 'stack-lg', novalidate: true },
    h('div', { class: 'card stack' }, picBox('avatar', 'صورتك', me.avatar_path, true), field('الاسم', name), field('المدينة', city)),
    h('div', { class: 'card stack' }, h('div', { class: 'h3' }, 'الدباب'), field('النوع', bikeType), field('الموديل', bikeModel),
      picBox('bike', 'صورة الدباب', me.bike_photo_path, false),
      h('div', { class: 'field' }, h('label', null, 'أسلوب الركوب المفضل'), styleRow)),
    h('div', { class: 'card stack' }, h('div', { class: 'h3' }, 'رقم التواصل (اختياري)'), phone,
      h('label', { class: 'check' }, showPhone, h('span', null, 'إظهار رقمي لأعضاء القروب', h('br'), h('span', { class: 'xs muted' }, 'إذا لم تفعّل الإظهار لن يراه أحد، ولا حتى الأدمن.')))),
    err, save);

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (save.classList.contains('busy')) return;
    err.hidden = true;
    const n = name.value.trim();
    const ph = phone.value.replace(/[^\d+ ]/g, '').trim();
    if (n.length < 2) { err.textContent = 'الاسم حرفان على الأقل.'; err.hidden = false; return; }
    if (ph && !/^\+?[0-9 ]{7,20}$/.test(ph)) { err.textContent = 'رقم التواصل غير صحيح.'; err.hidden = false; return; }
    save.classList.add('busy'); save.textContent = 'جارٍ الحفظ…';
    const uploaded = [], toDelete = [];
    try {
      const patch = { display_name: n, city: city.value.trim() || null, bike_type: bikeType.value.trim() || null,
        bike_model: bikeModel.value.trim() || null, riding_style: style };
      if (pics.avatar.file) {
        const { blob } = await compressImage(pics.avatar.file, 512, 0.85);
        patch.avatar_path = await uploadToMyFolder('avatars', blob, 'image/jpeg', 'jpg'); uploaded.push(patch.avatar_path);
        if (me.avatar_path) toDelete.push(me.avatar_path);
      } else if (pics.avatar.remove && me.avatar_path) { patch.avatar_path = null; toDelete.push(me.avatar_path); }
      if (pics.bike.file) {
        const { blob } = await compressImage(pics.bike.file, 1600, 0.82);
        patch.bike_photo_path = await uploadToMyFolder('bikes', blob, 'image/jpeg', 'jpg'); uploaded.push(patch.bike_photo_path);
        if (me.bike_photo_path) toDelete.push(me.bike_photo_path);
      } else if (pics.bike.remove && me.bike_photo_path) { patch.bike_photo_path = null; toDelete.push(me.bike_photo_path); }

      const rows = await must(state.sb.from('profiles').update(patch).eq('id', myId()).select('*'));
      if (!rows.length) throw new Error('not_allowed');
      state.me = rows[0]; state.members.set(rows[0].id, rows[0]);
      if (ph || contact) {
        await must(state.sb.from('member_contacts').upsert({ user_id: myId(), phone: ph || null, show_phone: showPhone.checked && !!ph }, { onConflict: 'user_id' }));
      }
      if (toDelete.length) removeFiles(toDelete).catch(() => {});
      toast('تم حفظ الملف', 'ok');
      location.hash = '#/me';
    } catch (ex) {
      if (uploaded.length) removeFiles(uploaded).catch(() => {});
      err.textContent = errMsg(ex); err.hidden = false;
    } finally { save.classList.remove('busy'); save.textContent = 'حفظ'; }
  };
  mount(body, form);
}
