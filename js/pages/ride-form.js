// إنشاء وتعديل طلعة
import { h, mount, icon, topbar, loadingView, errorView, emptyView, toast, errMsg, toRiyadhInput, fromRiyadhInput, STOP_KIND, fmtKm, dayKey, STYLE } from '../ui.js';
import { state, must, myId, isAdmin } from '../core.js';
import { pickPoint, computeRoute } from '../geo.js';

export default async function rideForm(root, params) {
  const id = params[0] || null;
  const body = h('div', { class: 'content' }, loadingView());
  mount(root, topbar({ title: id ? 'تعديل الطلعة' : 'طلعة جديدة', back: id ? `#/ride/${id}` : '#/rides' }), body);

  let ride = null, stops = [];
  if (id) {
    try {
      ride = await must(state.sb.from('rides').select('*').eq('id', id).maybeSingle());
      if (!ride) { mount(body, emptyView('route', 'الطلعة غير موجودة')); return; }
      if (!(isAdmin() || ride.organizer_id === myId() || ride.created_by === myId())) {
        mount(body, emptyView('shield', 'لا تملك صلاحية التعديل', 'التعديل للمنظّم والأدمن فقط.')); return;
      }
      stops = await must(state.sb.from('ride_stops').select('*').eq('ride_id', id).order('position'));
    } catch (e) { mount(body, errorView(e, () => rideForm(root, params))); return; }
  }

  const v = (x) => x ?? '';
  const title = h('input', { class: 'input', maxlength: 80, value: v(ride?.title), placeholder: 'مثال: طلعة الثمامة الليلية' });
  let rideStyle = ride?.ride_style || null;
  const styleRow = h('div', { class: 'picker-row' });
  const drawStyle = () => styleRow.replaceChildren(...Object.entries(STYLE).map(([k, t]) =>
    h('button', { type: 'button', class: 'pick' + (rideStyle === k ? ' on' : ''), onclick: () => { rideStyle = rideStyle === k ? null : k; drawStyle(); } }, t)));
  drawStyle();
  const desc = h('textarea', { class: 'textarea', maxlength: 2000, placeholder: 'تفاصيل، السرعة المتوقعة، ملاحظات…' }, v(ride?.description));
  const defMeet = `${dayKey(Date.now() + 864e5)}T21:00`; // غدًا 9 مساءً بتوقيت السعودية
  const meetAt = h('input', { class: 'input', type: 'datetime-local', value: ride ? toRiyadhInput(ride.meet_at) : defMeet });
  const departAt = h('input', { class: 'input', type: 'datetime-local', value: toRiyadhInput(ride?.depart_at) });
  const returnAt = h('input', { class: 'input', type: 'datetime-local', value: toRiyadhInput(ride?.return_at) });

  const pointField = (label, nameVal, lat, lng, placeholder) => {
    const st = { lat, lng };
    const name = h('input', { class: 'input', maxlength: 120, value: v(nameVal), placeholder });
    const coords = h('span', { class: 'xs muted ltr' });
    const btn = h('button', { class: 'btn sm', type: 'button' }, icon('pin'), 'على الخريطة');
    const clr = h('button', { class: 'btn sm ghost', type: 'button' }, 'مسح');
    const drawC = () => { coords.textContent = st.lat != null ? `${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}` : 'لم تُحدد نقطة'; clr.hidden = st.lat == null; };
    btn.onclick = async () => {
      const p = await pickPoint({ title: label, initial: st.lat != null ? st : null });
      if (p) { st.lat = p.lat; st.lng = p.lng; drawC(); if (p.label && !name.value.trim()) name.value = p.label; }
    };
    clr.onclick = () => { st.lat = null; st.lng = null; drawC(); };
    drawC();
    return { st, name, el: h('div', { class: 'field' }, h('label', null, label), name, h('div', { class: 'row between' }, coords, h('div', { class: 'row', style: { gap: '6px' } }, clr, btn))) };
  };
  const meet = pointField('نقطة التجمع *', ride?.meet_name, ride?.meet_lat, ride?.meet_lng, 'مثال: محطة الدريس — طريق الملك فهد');
  const dest = pointField('الوجهة', ride?.dest_name, ride?.dest_lat, ride?.dest_lng, 'مثال: منتزه الثمامة');

  // المحطات
  const stopsBox = h('div', { class: 'stack', style: { gap: '10px' } });
  const stopRows = [];
  const addStop = (s = {}) => {
    const row = { id: s.id || null, kind: s.kind || 'fuel', lat: s.lat ?? null, lng: s.lng ?? null };
    const kind = h('select', { class: 'select' }, ...Object.entries(STOP_KIND).map(([k, t]) => h('option', { value: k, selected: row.kind === k }, t)));
    kind.onchange = () => { row.kind = kind.value; };
    const name = h('input', { class: 'input', maxlength: 80, value: v(s.name), placeholder: 'اسم المحطة / الاستراحة' });
    const coords = h('span', { class: 'xs muted ltr' });
    const drawC = () => { coords.textContent = row.lat != null ? `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}` : 'حدد النقطة'; };
    drawC();
    const pickB = h('button', { class: 'btn sm', type: 'button', onclick: async () => {
      const p = await pickPoint({ title: 'موقع المحطة', initial: row.lat != null ? row : (meet.st.lat != null ? meet.st : null) });
      if (p) { row.lat = p.lat; row.lng = p.lng; drawC(); if (p.label && !name.value.trim()) name.value = p.label; }
    } }, icon('pin'), 'النقطة');
    const card = h('div', { class: 'card stack', style: { padding: '12px', gap: '8px' } },
      h('div', { class: 'row' }, kind, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'حذف المحطة', onclick: () => { stopRows.splice(stopRows.indexOf(row), 1); card.remove(); } }, icon('trash'))),
      name, h('div', { class: 'row between' }, coords, pickB));
    row.nameEl = name;
    stopRows.push(row);
    stopsBox.appendChild(card);
  };
  stops.forEach(addStop);

  // المنظّم (للأدمن فقط)
  let organizerSel = null;
  if (isAdmin()) {
    const current = ride?.organizer_id || myId();
    organizerSel = h('select', { class: 'select' }, ...[...state.members.values()].filter((m) => m.status === 'active')
      .map((m) => h('option', { value: m.id, selected: m.id === current }, m.display_name)));
  }

  const err = h('div', { class: 'form-error', hidden: true });
  const info = h('div', { class: 'notice', hidden: true });
  const save = h('button', { class: 'btn primary block lg', type: 'submit' }, id ? 'حفظ التعديلات' : 'نشر الطلعة');
  const form = h('form', { class: 'stack-lg', novalidate: true },
    h('div', { class: 'field' }, h('label', null, 'اسم الطلعة *'), title),
    h('div', { class: 'field' }, h('label', null, 'أسلوب الطلعة'), styleRow, h('div', { class: 'hint' }, 'اختياري — يساعد الشباب يعرفون إذا الطلعة تناسبهم.')),
    h('div', { class: 'field' }, h('label', null, 'الوصف'), desc),
    organizerSel ? h('div', { class: 'field' }, h('label', null, 'المنظّم'), organizerSel) : h('div', { class: 'xs muted' }, 'أنت منظّم هذه الطلعة.'),
    h('div', { class: 'card stack' },
      h('div', { class: 'h3' }, 'المواعيد (بتوقيت السعودية)'),
      h('div', { class: 'field' }, h('label', null, 'وقت التجمع *'), meetAt),
      h('div', { class: 'field' }, h('label', null, 'وقت التحرك'), departAt),
      h('div', { class: 'field' }, h('label', null, 'وقت العودة المتوقع'), returnAt)),
    h('div', { class: 'card stack' }, h('div', { class: 'h3' }, 'الأماكن'), meet.el, dest.el),
    h('div', { class: 'card stack' },
      h('div', { class: 'h3' }, 'محطات البنزين والاستراحات'),
      h('div', { class: 'xs muted' }, 'بترتيب المرور عليها. تُستخدم لحساب المسار إن توفرت الخدمة.'),
      stopsBox,
      h('button', { class: 'btn sm outline', type: 'button', onclick: () => addStop() }, icon('plus'), 'إضافة محطة')),
    err, info, save);

  const fail = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (save.classList.contains('busy')) return;
    err.hidden = true; info.hidden = true;
    const meetIso = fromRiyadhInput(meetAt.value), depIso = fromRiyadhInput(departAt.value), retIso = fromRiyadhInput(returnAt.value);
    if (title.value.trim().length < 3) return fail('اكتب اسم الطلعة (3 أحرف على الأقل).');
    if (!meetIso) return fail('حدد وقت التجمع.');
    if (meet.name.value.trim().length < 2) return fail('اكتب اسم نقطة التجمع.');
    if (depIso && depIso < meetIso) return fail('وقت التحرك يجب أن يكون بعد وقت التجمع.');
    if (retIso && retIso < (depIso || meetIso)) return fail('وقت العودة يجب أن يكون بعد التحرك.');
    for (const s of stopRows) {
      if (!s.nameEl.value.trim()) return fail('اكتب اسم كل محطة أو احذفها.');
      if (s.lat == null) return fail(`حدد موقع المحطة «${s.nameEl.value.trim()}» على الخريطة.`);
    }
    save.classList.add('busy');
    try {
      let routeRes = null, routeTried = false;
      const pts = [meet.st, ...stopRows, dest.st].filter((p) => p.lat != null);
      if (meet.st.lat != null && dest.st.lat != null) {
        save.textContent = 'جارٍ حساب المسار…'; routeTried = true;
        routeRes = await computeRoute(pts.map((p) => ({ lat: p.lat, lng: p.lng })));
      }
      save.textContent = 'جارٍ الحفظ…';
      const payload = {
        title: title.value.trim(), description: desc.value.trim() || null, ride_style: rideStyle,
        meet_at: meetIso, depart_at: depIso, return_at: retIso,
        meet_name: meet.name.value.trim(), meet_lat: meet.st.lat ?? null, meet_lng: meet.st.lng ?? null,
        dest_name: dest.name.value.trim() || null, dest_lat: dest.st.lat ?? null, dest_lng: dest.st.lng ?? null,
        distance_km: routeRes ? routeRes.distance_km : null, route_geojson: routeRes ? routeRes.geojson : null,
      };
      if (organizerSel) payload.organizer_id = organizerSel.value;
      let rideId = id;
      if (id) {
        const rows = await must(state.sb.from('rides').update(payload).eq('id', id).select('id'));
        if (!rows.length) throw new Error('not_allowed');
      } else {
        const row = await must(state.sb.from('rides').insert(payload).select('id').single());
        rideId = row.id;
      }
      // مزامنة المحطات
      const keep = new Set(stopRows.filter((s) => s.id).map((s) => s.id));
      const removed = stops.filter((s) => !keep.has(s.id)).map((s) => s.id);
      if (removed.length) await must(state.sb.from('ride_stops').delete().in('id', removed));
      for (const [i, s] of stopRows.entries()) {
        const data = { kind: s.kind, name: s.nameEl.value.trim(), lat: s.lat, lng: s.lng, position: i };
        if (s.id) await must(state.sb.from('ride_stops').update(data).eq('id', s.id));
        else await must(state.sb.from('ride_stops').insert({ ...data, ride_id: rideId }));
      }
      toast(id ? 'تم حفظ التعديلات' : 'تم نشر الطلعة', 'ok');
      if (routeTried && !routeRes) toast('تعذّر حساب مسار فعلي — ستظهر النقاط فقط', '', 5000);
      else if (routeRes) toast(`المسافة التقديرية ${fmtKm(routeRes.distance_km)}`, '', 3000);
      location.hash = `#/ride/${rideId}`;
    } catch (ex) { fail(errMsg(ex)); }
    finally { save.classList.remove('busy'); save.textContent = id ? 'حفظ التعديلات' : 'نشر الطلعة'; }
  };
  mount(body, form);
}
