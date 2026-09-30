// ===============================================================
//  NightRiders — ملف الإعدادات
//  إعدادات مشروع NightRiders الفعلي (المفتاح عام وآمن للواجهة).
//  تنبيه: لا تضع service_role key هنا أبدًا. المفتاح العام آمن للواجهة
//  لأن الحماية الفعلية في سياسات RLS داخل قاعدة البيانات.
// ===============================================================
window.NR_CONFIG = {
  supabaseUrl: 'https://wmhjrtwryuyguracnibf.supabase.co',
  supabaseAnonKey: 'sb_publishable_O6YS8i0sYLjS5RkUx8MiAQ_BvZMgWCt',

  // حاوية التخزين (مطابقة لملف schema.sql)
  storageBucket: 'nightriders',

  // خدمة حساب المسار والمسافة (OSRM). الخادم العام تجريبي ومحدود الاستخدام.
  // اتركها فارغة '' لتعطيل حساب المسار؛ سيعرض التطبيق النقاط فقط.
  routingUrl: 'https://router.project-osrm.org',

  // طبقة الخريطة (OpenStreetMap، تُعرض داكنة عبر CSS). يجب إبقاء نص الإسناد.
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; OpenStreetMap contributors',

  // مركز الخريطة الافتراضي (الرياض)
  defaultCenter: [24.7136, 46.6753],
  defaultZoom: 11,
};
