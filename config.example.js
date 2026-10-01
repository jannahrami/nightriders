// ===============================================================
//  Jeddah Ride — ملف الإعدادات
//  1) انسخ هذا الملف باسم config.js في نفس المجلد.
//  2) ضع عنوان مشروعك والمفتاح العام (anon / publishable key) من:
//     Supabase Dashboard ← Project Settings ← API
//  تنبيه: لا تضع service_role key هنا أبدًا. المفتاح العام آمن للواجهة
//  لأن الحماية الفعلية في سياسات RLS داخل قاعدة البيانات.
// ===============================================================
window.NR_CONFIG = {
  // ---------- هوية القروب (كل ما يخص الاسم والألوان والمدينة في مكان واحد) ----------
  // لتجهيز نسخة لقروب جديد شغّل: python3 tools/brand.py  (يحدّث هذا القسم + الأيقونات + manifest + index.html)
  brand: {
    name: 'Jeddah Ride',            // الاسم الكامل (يظهر في العنوان والدعوات والرسائل)
    wordmark: ['Jeddah ', 'Ride'],  // الاسم في الشريط العلوي: الجزء الثاني يأخذ لون القروب
    city: 'جدة',                    // المدينة الافتراضية (خانات المدينة)
    colors: { from: '#2f6bff', to: '#7a4dff', accent: '#4f7dff', highlight: '#29d3ff' },
  },
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',

  // حاوية التخزين (مطابقة لملف schema.sql)
  storageBucket: 'nightriders',

  // مفتاح الإشعارات العام (VAPID public key) — انظر README قسم الإشعارات. اتركه '' لتعطيلها
  pushPublicKey: '',

  // خدمة حساب المسار والمسافة (OSRM). الخادم العام تجريبي ومحدود الاستخدام.
  // اتركها فارغة '' لتعطيل حساب المسار؛ سيعرض التطبيق النقاط فقط.
  routingUrl: 'https://router.project-osrm.org',

  // طبقة الخريطة (OpenStreetMap بألوانها الفاتحة). يجب إبقاء نص الإسناد.
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; OpenStreetMap contributors',

  // مركز الخريطة الافتراضي (جدة)
  defaultCenter: [21.5433, 39.1728],
  defaultZoom: 11,
};
