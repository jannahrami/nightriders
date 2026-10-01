// ===============================================================
//  Jeddah Ride — ملف الإعدادات
//  إعدادات مشروع Jeddah Ride الفعلي (المفتاح عام وآمن للواجهة).
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
  supabaseUrl: 'https://wmhjrtwryuyguracnibf.supabase.co',
  supabaseAnonKey: 'sb_publishable_O6YS8i0sYLjS5RkUx8MiAQ_BvZMgWCt',

  // حاوية التخزين (مطابقة لملف schema.sql)
  storageBucket: 'nightriders',

  // مفتاح الإشعارات العام (VAPID public key) — عام وآمن للواجهة
  pushPublicKey: 'BAfHqsuPeR7WqKkIsQkvv6dQkxnM5FbUN5hwkWSu8ZMkiD7rxKxtKDsqJNO1VRLuOkoDdO5t45jU5ya9hedRAMI',

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
