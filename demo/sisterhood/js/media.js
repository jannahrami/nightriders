// التخزين الخاص: روابط موقّعة مؤقتة، ضغط الصور، الرفع، صور الأعضاء
import { h, mount, uuid } from './ui.js';
import { state } from './core.js';

const SIGN_SECONDS = 3600;
const urlCache = new Map(); // path -> { url, exp }
const pending = new Map();  // path -> Promise

export const IMAGE_INPUT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;

const bucket = () => state.sb.storage.from(state.cfg.storageBucket);

/** رابط موقّع مؤقت لملف خاص (يحترم سياسات التخزين: الأعضاء المقبولون فقط) */
export function signedUrl(path) {
  if (!path) return Promise.resolve(null);
  const c = urlCache.get(path);
  if (c && c.exp > Date.now() + 60000) return Promise.resolve(c.url);
  if (pending.has(path)) return pending.get(path);
  const p = bucket().createSignedUrl(path, SIGN_SECONDS).then(({ data, error }) => {
    pending.delete(path);
    if (error || !data) return null;
    urlCache.set(path, { url: data.signedUrl, exp: Date.now() + SIGN_SECONDS * 1000 });
    return data.signedUrl;
  }).catch(() => { pending.delete(path); return null; });
  pending.set(path, p);
  return p;
}
export function forgetUrl(path) { urlCache.delete(path); }

function loadImageEl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_decode_failed')); };
    img.src = url;
  });
}

/** يضغط الصورة إلى JPEG بأبعاد قصوى محددة قبل الرفع */
export async function compressImage(file, maxDim = 1920, quality = 0.82) {
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error('الصورة كبيرة جدًا (الحد 25MB قبل الضغط).');
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { try { src = await loadImageEl(file); } catch { throw new Error('تعذّر قراءة الصورة. جرّب صورة JPEG أو PNG.'); } }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.round(w0 * scale), hgt = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
  ctx.drawImage(src, 0, 0, w, hgt);
  if (src.close) src.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('تعذّر ضغط الصورة.');
  return { blob, width: w, height: hgt, type: 'image/jpeg' };
}

/** رفع ملف إلى مجلد العضو. المسار يبدأ دائمًا بمعرّف العضو (تفرضه سياسة التخزين). */
export async function uploadToMyFolder(sub, blob, contentType, ext) {
  const uid = state.session.user.id;
  const path = `${uid}/${sub}/${uuid()}.${ext}`;
  const { error } = await bucket().upload(path, blob, { contentType, upsert: false, cacheControl: '3600' });
  if (error) throw error;
  return path;
}
export async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await bucket().remove(list);
  if (error) throw error;
  list.forEach(forgetUrl);
}

// ---------- صورة العضو ----------
const COLORS = ['#3d5afe', '#7c4dff', '#00a3c4', '#2e7d6b', '#b8527a', '#8d6e2f', '#5c6bc0', '#c2185b'];
function colorFor(id = '') { let n = 0; for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[n % COLORS.length]; }
export function initials(name = '') {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
}
export function avatar(p, cls = '') {
  const ready = p?.ready_until && new Date(p.ready_until) > new Date();
  const el = h('div', { class: `avatar ${cls} ${ready ? 'ready' : ''}`, style: { background: colorFor(p?.id) }, 'aria-hidden': 'true' }, initials(p?.display_name));
  if (p?.avatar_path) signedUrl(p.avatar_path).then((u) => { if (u) mount(el, h('img', { src: u, alt: '', loading: 'lazy' })); });
  return el;
}

/** عنصر صورة خاصة يُحمّل رابطه الموقّع عند العرض */
export function privateImg(path, props = {}) {
  const img = h('img', { alt: props.alt || '', loading: 'lazy', ...props });
  signedUrl(path).then((u) => { if (u) img.src = u; else img.replaceWith(h('div', { class: 'map-fallback' }, 'تعذّر تحميل الصورة')); });
  return img;
}
