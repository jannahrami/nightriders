// لوحة الأدمن: طلبات الانضمام، الأعضاء، الدعوات، الإعلانات، الطلعات
import { h, mount, icon, topbar, chip, loadingView, errorView, emptyView, fmtRelative, fmtDateTime, actionBtn, confirmDialog, toast, openSheet, RIDE_STATUS } from '../ui.js';
import { state, must, myId, isOwner, loadMembers, member, on } from '../core.js';
import { personRow } from '../components.js';

export default async function adminPage(root, _p, query) {
  let tab = query.get('tab') || ([...state.members.values()].some((m) => m.status === 'pending') ? 'pending' : 'members');
  const tabs = h('div', { class: 'tabs' });
  const body = h('div', { class: 'stack' });
  mount(root, topbar({ title: 'لوحة الأدمن', back: '#/me' }), h('div', { class: 'content stack-lg' }, tabs, body));

  const drawTabs = () => {
    const pendingCount = [...state.members.values()].filter((m) => m.status === 'pending').length;
    tabs.replaceChildren(...[['pending', 'طلبات الانضمام', pendingCount], ['members', 'الأعضاء'], ['invites', 'الدعوات'], ['ann', 'الإعلانات'], ['rides', 'الطلعات']]
      .map(([k, t, n]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; drawTabs(); draw(); } }, t, n ? h('span', { class: 'count' }, n) : null)));
  };
  const draw = () => ({ pending, members, invites, ann, rides }[tab])();
  const refreshMembers = async () => { await loadMembers(); drawTabs(); draw(); };

  // ----- طلبات الانضمام -----
  function pending() {
    const rows = [...state.members.values()].filter((m) => m.status === 'pending');
    mount(body, rows.length ? h('div', { class: 'card' }, h('div', { class: 'list' }, ...rows.map((m) => personRow(m, [m.bike_type, `طلب ${fmtRelative(m.created_at)}`].filter(Boolean).join(' · '),
      h('div', { class: 'row', style: { gap: '6px' } },
        actionBtn('قبول', 'sm success', async () => { await must(state.sb.rpc('approve_member', { p_user: m.id })); toast(`تم قبول ${m.display_name}`, 'ok'); refreshMembers(); }, 'check'),
        actionBtn('رفض', 'sm danger-soft', async () => {
          if (!(await confirmDialog(`رفض طلب ${m.display_name}؟ سيُمنع من الوصول.`, { danger: true, ok: 'رفض' }))) return;
          await must(state.sb.rpc('suspend_member', { p_user: m.id })); toast('تم الرفض', 'ok'); refreshMembers();
        }))))))
      : emptyView('users', 'لا توجد طلبات انضمام', 'أنشئ دعوة وأرسلها للعضو الجديد.', h('button', { class: 'btn primary', onclick: () => { tab = 'invites'; drawTabs(); draw(); } }, 'إنشاء دعوة')));
  }

  // ----- الأعضاء -----
  function members() {
    const all = [...state.members.values()];
    const active = all.filter((m) => m.status === 'active').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const suspended = all.filter((m) => m.status === 'suspended');
    const roleChip = (m) => m.role === 'owner' ? chip('الأساسي', 'violet') : m.role === 'admin' ? chip('أدمن', 'violet') : null;
    const menu = (m) => {
      if (m.id === myId() || m.role === 'owner') return roleChip(m);
      if (m.role === 'admin' && !isOwner()) return roleChip(m);
      return h('div', { class: 'row', style: { gap: '6px' } }, roleChip(m), h('button', { class: 'icon-btn', 'aria-label': 'خيارات', onclick: () => openSheet(m.display_name, (close) => h('div', { class: 'stack' },
        isOwner() ? actionBtn(m.role === 'admin' ? 'إزالة صلاحية الأدمن' : 'تعيين أدمن', 'block', async () => {
          const make = m.role !== 'admin';
          if (!(await confirmDialog(make ? `منح ${m.display_name} صلاحية الأدمن؟ سيتمكن من قبول وإيقاف الأعضاء وإدارة الدعوات والطلعات.` : `إزالة صلاحية الأدمن من ${m.display_name}؟`))) return;
          await must(state.sb.rpc('set_admin', { p_user: m.id, p_is_admin: make })); toast('تم الحفظ', 'ok'); close(); refreshMembers();
        }, 'shield') : null,
        actionBtn('إيقاف العضو', 'danger block', async () => {
          if (!(await confirmDialog(`إيقاف ${m.display_name}؟ سيُمنع فورًا من البيانات والملفات والتحديثات المباشرة، ويُحذف موقعه المشارك.`, { danger: true, ok: 'إيقاف' }))) return;
          await must(state.sb.rpc('suspend_member', { p_user: m.id })); toast('تم الإيقاف', 'ok'); close(); refreshMembers();
        }, 'stop'),
        h('button', { class: 'btn ghost block', onclick: close }, 'إلغاء'))) }, icon('more')));
    };
    mount(body,
      h('div', { class: 'section-head' }, h('div', { class: 'h2' }, `الأعضاء النشطون (${active.length})`)),
      h('div', { class: 'card' }, h('div', { class: 'list' }, ...active.map((m) => personRow(m, [m.bike_type, m.city, `انضم ${fmtRelative(m.created_at)}`].filter(Boolean).join(' · '), menu(m))))),
      !isOwner() ? h('div', { class: 'xs muted' }, 'تعيين أدمن إضافي وإيقاف الأدمن متاحان للأدمن الأساسي فقط.') : null,
      suspended.length ? h('div', { class: 'section-head' }, h('div', { class: 'h2' }, `موقوفون (${suspended.length})`)) : null,
      suspended.length ? h('div', { class: 'card' }, h('div', { class: 'list' }, ...suspended.map((m) => personRow(m, 'موقوف',
        actionBtn('إعادة التفعيل', 'sm', async () => { await must(state.sb.rpc('approve_member', { p_user: m.id })); toast('تمت إعادة التفعيل', 'ok'); refreshMembers(); }))))) : null);
  }

  // ----- الدعوات -----
  async function invites() {
    mount(body, loadingView());
    try {
      const rows = await must(state.sb.from('invites').select('*').order('created_at', { ascending: false }).limit(50));
      const now = new Date();
      const st = (i) => i.revoked_at ? ['ملغاة', 'red'] : new Date(i.expires_at) <= now ? ['منتهية', ''] : i.uses >= i.max_uses ? ['مستخدمة', 'blue'] : ['فعّالة', 'green'];
      mount(body,
        h('button', { class: 'btn primary block', onclick: createInvite }, icon('plus'), 'إنشاء دعوة جديدة'),
        rows.length ? h('div', { class: 'stack' }, ...rows.map((i) => {
          const [t, c] = st(i);
          const usable = t === 'فعّالة';
          return h('div', { class: 'card stack', style: { gap: '8px' } },
            h('div', { class: 'row between' }, h('span', { class: 'en', style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '18px', letterSpacing: '.12em' } }, i.code), chip(t, c)),
            h('div', { class: 'xs muted' }, `${i.note ? i.note + ' · ' : ''}استُخدمت ${i.uses}/${i.max_uses} · تنتهي ${fmtDateTime(i.expires_at)}`),
            usable ? h('div', { class: 'btn-row' },
              h('button', { class: 'btn sm', onclick: () => shareInvite(i) }, icon('share'), 'مشاركة'),
              actionBtn('إلغاء الدعوة', 'sm danger-soft', async () => {
                if (!(await confirmDialog('إلغاء هذه الدعوة؟ لن يمكن استخدامها بعد الآن.', { danger: true }))) return;
                await must(state.sb.rpc('revoke_invite', { p_invite: i.id })); toast('تم إلغاء الدعوة', 'ok'); invites();
              })) : null);
        })) : emptyView('share', 'لا توجد دعوات بعد'));
    } catch (e) { mount(body, errorView(e, invites)); }
  }
  const inviteLink = (code) => `${location.origin}${location.pathname}#/join?code=${code}`;
  function shareInvite(i) {
    const link = inviteLink(i.code);
    const text = `دعوة للانضمام لقروب Jeddah Ride 🏍️\nالكود: ${i.code}\nالرابط: ${link}\nصالحة حتى ${fmtDateTime(i.expires_at)}`;
    openSheet('مشاركة الدعوة', (close) => h('div', { class: 'stack' },
      h('div', { class: 'code-display' }, i.code),
      h('div', { class: 'xs muted', style: { wordBreak: 'break-all', direction: 'ltr' } }, link),
      navigator.share ? h('button', { class: 'btn primary block', onclick: () => navigator.share({ title: 'Jeddah Ride', text }).catch(() => {}) }, icon('share'), 'مشاركة') : null,
      h('button', { class: 'btn block', onclick: async () => {
        try { await navigator.clipboard.writeText(text); toast('تم النسخ', 'ok', 1500); } catch { toast('تعذّر النسخ — انسخ الكود يدويًا', 'err'); }
      } }, icon('copy'), 'نسخ نص الدعوة'),
      h('a', { class: 'btn block', href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, icon('chat'), 'إرسال عبر واتساب'),
      h('div', { class: 'xs muted' }, 'بعد تسجيل العضو ستظهر لك طلبه في «طلبات الانضمام» للموافقة.'),
      h('button', { class: 'btn ghost block', onclick: close }, 'إغلاق')));
  }
  function createInvite() {
    openSheet('دعوة جديدة', (close) => {
      let hours = 72, uses = 1;
      const hrs = h('div', { class: 'picker-row' }), usesRow = h('div', { class: 'picker-row' });
      const drawP = () => {
        hrs.replaceChildren(...[[24, 'يوم'], [72, '3 أيام'], [168, 'أسبوع']].map(([v, t]) => h('button', { type: 'button', class: 'pick' + (hours === v ? ' on' : ''), onclick: () => { hours = v; drawP(); } }, t)));
        usesRow.replaceChildren(...[[1, 'شخص واحد'], [5, '5 أشخاص'], [10, '10 أشخاص']].map(([v, t]) => h('button', { type: 'button', class: 'pick' + (uses === v ? ' on' : ''), onclick: () => { uses = v; drawP(); } }, t)));
      };
      drawP();
      const note = h('input', { class: 'input', maxlength: 80, placeholder: 'لمن الدعوة؟ (ملاحظة لك فقط)' });
      const go = actionBtn('إنشاء الدعوة', 'primary block', async () => {
        const inv = await must(state.sb.rpc('create_invite', { p_hours: hours, p_max_uses: uses, p_note: note.value.trim() || null }));
        close(); toast('تم إنشاء الدعوة', 'ok'); invites(); shareInvite(Array.isArray(inv) ? inv[0] : inv);
      });
      return h('div', { class: 'stack' },
        h('div', { class: 'field' }, h('label', null, 'مدة الصلاحية'), hrs),
        h('div', { class: 'field' }, h('label', null, 'عدد مرات الاستخدام'), usesRow),
        h('div', { class: 'field' }, h('label', null, 'ملاحظة'), note), go);
    });
  }

  // ----- الإعلانات -----
  async function ann() {
    mount(body, loadingView());
    try {
      const rows = await must(state.sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(50));
      mount(body,
        h('button', { class: 'btn primary block', onclick: () => editAnn() }, icon('plus'), 'إعلان جديد'),
        rows.length ? rows.map((a) => h('div', { class: 'card stack', style: { gap: '8px' } },
          h('div', { class: 'row between' }, h('div', { class: 'h3' }, a.title), a.pinned ? chip('مثبت', 'violet') : chip('غير مثبت')),
          a.body ? h('div', { class: 'small', style: { whiteSpace: 'pre-wrap', color: 'var(--text-2)' } }, a.body) : null,
          h('div', { class: 'xs muted' }, `${member(a.created_by)?.display_name || ''} · ${fmtRelative(a.created_at)}`),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn sm', onclick: () => editAnn(a) }, icon('edit'), 'تعديل'),
            actionBtn('حذف', 'sm danger-soft', async () => {
              if (!(await confirmDialog('حذف الإعلان؟', { danger: true, ok: 'حذف' }))) return;
              const d = await must(state.sb.from('announcements').delete().eq('id', a.id).select('id'));
              if (!d.length) throw new Error('not_allowed');
              toast('تم الحذف', 'ok'); ann();
            }, 'trash')))) : emptyView('info', 'لا توجد إعلانات'));
    } catch (e) { mount(body, errorView(e, ann)); }
  }
  function editAnn(a) {
    openSheet(a ? 'تعديل الإعلان' : 'إعلان جديد', (close) => {
      const title = h('input', { class: 'input', maxlength: 100, value: a?.title || '' });
      const text = h('textarea', { class: 'textarea', maxlength: 2000 }, a?.body || '');
      const pinned = h('input', { type: 'checkbox', checked: a ? a.pinned : true });
      const err = h('div', { class: 'form-error', hidden: true });
      const save = actionBtn('حفظ', 'primary block', async () => {
        if (title.value.trim().length < 2) { err.textContent = 'اكتب عنوانًا.'; err.hidden = false; return; }
        const data = { title: title.value.trim(), body: text.value.trim() || null, pinned: pinned.checked };
        const rows = await must(a ? state.sb.from('announcements').update(data).eq('id', a.id).select('id') : state.sb.from('announcements').insert(data).select('id'));
        if (!rows.length) throw new Error('not_allowed');
        toast('تم الحفظ', 'ok'); close(); ann();
      });
      return h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', null, 'العنوان'), title),
        h('div', { class: 'field' }, h('label', null, 'النص'), text),
        h('label', { class: 'check' }, pinned, h('span', null, 'تثبيت في الصفحة الرئيسية')), err, save);
    });
  }

  // ----- الطلعات -----
  async function rides() {
    mount(body, loadingView());
    try {
      const rows = await must(state.sb.from('rides').select('id,title,status,meet_at,organizer_id').order('meet_at', { ascending: false }).limit(60));
      mount(body, h('div', { class: 'xs muted' }, 'لإدارة طلعة (تعديل، قائد، حالة، حذف) افتحها من هنا.'),
        rows.length ? h('div', { class: 'card' }, h('div', { class: 'list' }, ...rows.map((r) => h('a', { class: 'item', href: `#/ride/${r.id}`, style: { color: 'inherit' } },
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, r.title), h('div', { class: 'xs muted' }, `${fmtDateTime(r.meet_at)} · ${member(r.organizer_id)?.display_name || '—'}`)),
          chip(RIDE_STATUS[r.status].t, RIDE_STATUS[r.status].c))))) : emptyView('route', 'لا توجد طلعات'));
    } catch (e) { mount(body, errorView(e, rides)); }
  }

  drawTabs(); draw();
  const off = on('members', () => { drawTabs(); if (tab === 'pending' || tab === 'members') draw(); });
  return off;
}
