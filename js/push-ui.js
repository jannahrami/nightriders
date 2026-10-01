// بطاقة الإشعارات (في «حسابي» وتنبيه مختصر في الرئيسية)
import { h, mount, icon, chip, toast, errMsg, actionBtn } from './ui.js';
import { pushStatus, enablePush, disablePush, loadPrefs, savePrefs, PUSH_ERR } from './push.js';

const ERR = (e) => PUSH_ERR[e?.message] || errMsg(e);

export function notifCard() {
  const box = h('div', { class: 'stack' }, h('div', { class: 'row' }, icon('bell'), h('div', { class: 'h3' }, 'الإشعارات')));
  const body = h('div', { class: 'stack' }, h('div', { class: 'small muted' }, '…'));
  box.appendChild(body);

  async function draw() {
    const st = await pushStatus();
    const head = box.firstChild;
    head.querySelector('.chip')?.remove();
    head.appendChild(chip(st === 'on' ? 'مفعّلة' : 'متوقفة', st === 'on' ? 'green' : ''));
    head.style.justifyContent = 'space-between';
    if (st === 'on') {
      let prefs;
      try { prefs = await loadPrefs(); } catch { prefs = { rides: true, help: true, chat: true }; }
      const row = (key, label, hint) => {
        const inp = h('input', { type: 'checkbox', checked: !!prefs[key], 'aria-label': label });
        inp.onchange = async () => {
          const old = prefs[key]; prefs[key] = inp.checked;
          try { await savePrefs(prefs); } catch (e) { prefs[key] = old; inp.checked = old; toast(errMsg(e), 'err'); }
        };
        return h('label', { class: 'row between', style: { gap: '12px', cursor: 'pointer' } },
          h('div', null, h('div', { style: { fontWeight: 600 } }, label), h('div', { class: 'xs muted' }, hint)),
          h('span', { class: 'switch' }, inp, h('span')));
      };
      mount(body,
        row('rides', 'طلعة جديدة', 'لما أحد ينشر طلعة'),
        row('help', 'طلبات الفزعة', 'لما أحد يحتاج مساعدة'),
        row('chat', 'رسائل الشات', 'الشات العام، وشات الطلعات اللي أنت مشارك فيها'),
        actionBtn('إيقاف الإشعارات على هذا الجهاز', 'ghost block', async () => { await disablePush(); toast('تم الإيقاف', 'ok'); draw(); }));
    } else if (st === 'off') {
      mount(body,
        h('div', { class: 'small muted' }, 'يوصلك تنبيه على الجوال حتى لو التطبيق مقفول: طلعة جديدة، طلب فزعة، ورسائل الشات.'),
        actionBtn('فعّل الإشعارات', 'primary block', async () => {
          try { await enablePush(); toast('تم تفعيل الإشعارات 👍', 'ok'); }
          catch (e) { toast(ERR(e), 'err', 7000); }
          draw();
        }, 'bell'));
    } else {
      mount(body, h('div', { class: 'notice' + (st === 'denied' ? ' warn' : '') }, icon('info'), h('div', null, PUSH_ERR[st] || PUSH_ERR.unsupported)));
    }
  }
  draw();
  return box;
}

/** تنبيه صغير في الرئيسية لمن لم يفعّل الإشعارات بعد (يختفي عند الإغلاق) */
export function notifNudge() {
  const wrap = h('div');
  let dismissed = false;
  try { dismissed = localStorage.getItem('nr.push.nudge') === 'x'; } catch { /* */ }
  if (dismissed) return wrap;
  pushStatus().then((st) => {
    if (st !== 'off' && st !== 'ios_install') return;
    const close = () => { try { localStorage.setItem('nr.push.nudge', 'x'); } catch { /* */ } wrap.remove(); };
    mount(wrap, h('div', { class: 'card stack', style: { gap: '10px' } },
      h('div', { class: 'row between' }, h('div', { class: 'row' }, icon('bell'), h('div', { class: 'h3' }, 'خلّك على اطلاع')),
        h('button', { class: 'icon-btn sm', 'aria-label': 'إغلاق', onclick: close }, icon('x'))),
      h('div', { class: 'small muted' }, st === 'ios_install' ? PUSH_ERR.ios_install : 'فعّل الإشعارات عشان توصلك الطلعات الجديدة وطلبات الفزعة ورسائل الشات.'),
      st === 'off' ? actionBtn('فعّل الإشعارات', 'primary block', async () => {
        try { await enablePush(); toast('تم تفعيل الإشعارات 👍', 'ok'); close(); }
        catch (e) { toast(ERR(e), 'err', 7000); }
      }, 'bell') : null));
  });
  return wrap;
}
