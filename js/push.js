// إشعارات الجوال (Web Push): تفعيل/إيقاف على هذا الجهاز + تفضيلات العضو
import { state, must, myId } from './core.js';
import { isIOS, isStandalone } from './ui.js';

const b64ToBytes = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

export const pushKey = () => state.cfg?.pushPublicKey || '';
export function pushSupport() {
  if (state.preview) return 'preview';
  if (!pushKey()) return 'no_key';
  if (isIOS() && !isStandalone()) return 'ios_install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg || navigator.serviceWorker.ready;
}

/** الحالة الحالية على هذا الجهاز: on | off | denied | (أسباب عدم الدعم) */
export async function pushStatus() {
  const sup = pushSupport();
  if (sup !== 'ok') return sup;
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

async function save(sub) {
  const j = sub.toJSON();
  await must(state.sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
}

/** يجب استدعاؤها من ضغطة زر (شرط iPhone) */
export async function enablePush() {
  const sup = pushSupport();
  if (sup !== 'ok') throw new Error(sup);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'push_denied' : 'push_dismissed');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pushKey()) });
  await save(sub);
}

export async function disablePush() {
  if (pushSupport() !== 'ok') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try { await state.sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint }); } catch { /* */ }
  await sub.unsubscribe().catch(() => {});
}

/** عند فتح التطبيق: لو الجهاز مشترك نحدّث ربطه بالحساب الحالي (مثلاً بعد تبديل الحساب) */
export async function syncPush() {
  try {
    if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch { /* بدون إزعاج */ }
}

/** قبل تسجيل الخروج: نفصل هذا الجهاز عن الحساب */
export async function detachPush() {
  try {
    if (pushSupport() !== 'ok') return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await state.sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  } catch { /* */ }
}

export async function loadPrefs() {
  const row = await must(state.sb.from('notification_prefs').select('rides,help,chat,ready').eq('user_id', myId()).maybeSingle());
  return row || { rides: true, help: true, chat: true, ready: true };
}
export async function savePrefs(p) {
  await must(state.sb.from('notification_prefs').upsert({ user_id: myId(), rides: p.rides, help: p.help, chat: p.chat, ready: p.ready }, { onConflict: 'user_id' }));
}

export const PUSH_ERR = {
  preview: 'الإشعارات ما تشتغل في رابط المعاينة.',
  no_key: 'الإشعارات غير مهيأة في هذه النسخة.',
  ios_install: 'في iPhone لازم تضيف التطبيق للشاشة الرئيسية أولًا (Safari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية»)، وبعدها افتحه من الأيقونة وفعّل الإشعارات.',
  unsupported: 'متصفحك ما يدعم الإشعارات. جرّب Safari على iPhone (iOS 16.4 أو أحدث) أو Chrome على أندرويد.',
  push_denied: 'الإشعارات مرفوضة لهذا التطبيق. فعّلها من إعدادات الجوال ← الإشعارات ← Jeddah Ride.',
  push_dismissed: 'ما تم التفعيل. اضغط الزر مرة ثانية واختر «سماح».',
  denied: 'الإشعارات مرفوضة لهذا التطبيق. فعّلها من إعدادات الجوال ← الإشعارات ← Jeddah Ride.',
};
