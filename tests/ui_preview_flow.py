import sys
from playwright.sync_api import sync_playwright
S = sys.argv[1] if len(sys.argv) > 1 else '.'
import os; BASE = os.environ.get('NR_URL', 'http://127.0.0.1:8765/index.html') + '?preview=1'
log = []
def check(name, cond): log.append(('PASS' if cond else 'FAIL') + '  ' + name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ar-SA', timezone_id='Asia/Riyadh')
    ctx.grant_permissions(['geolocation']); ctx.set_geolocation({'latitude':24.7136,'longitude':46.6753,'accuracy':15})
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    toast = lambda: ' | '.join(page.locator('.toast').all_inner_texts())
    page.goto(BASE + '#/home'); page.wait_for_timeout(1200)

    # 1) جاهز أطلع
    page.get_by_role('button', name='ساعتين').first.click(); page.wait_for_timeout(500)
    check('جاهز أطلع يتفعّل ويظهر «تم الحفظ» بعد النجاح', 'تم التفعيل' in toast() and page.locator('text=مفعّل').count() > 0)

    # 2) الشات: إرسال رسالة + منع التكرار بالضغط المزدوج
    page.goto(BASE + '#/chat'); page.wait_for_timeout(1000)
    before = page.locator('.msg').count()
    page.fill('textarea', 'رسالة اختبار'); 
    page.locator('.composer .send').dblclick(); page.wait_for_timeout(800)
    after = page.locator('.msg').count()
    check(f'الضغط المزدوج يرسل رسالة واحدة ({before}→{after})', after == before + 1)
    check('الرسالة تظهر بدون حالة فشل', page.locator('.msg.failed').count() == 0 and page.locator('text=رسالة اختبار').count() == 1)
    page.screenshot(path=f'{S}/flow_chat.png')

    # 3) حذف رسالتي
    page.locator('.msg.me').last.hover(); page.locator('.msg.me').last.locator('.del').click()
    page.get_by_role('button', name='حذف').last.click(); page.wait_for_timeout(600)
    check('حذف الرسالة الخاصة', page.locator('text=رسالة اختبار').count() == 0)

    # 4) إنشاء طلعة
    page.goto(BASE + '#/rides/new'); page.wait_for_timeout(900)
    page.locator('form input.input').first.fill('طلعة اختبار')
    page.get_by_role('button', name='نشر الطلعة').click(); page.wait_for_timeout(600)
    check('التحقق: اسم نقطة التجمع مطلوب', page.locator('.form-error').inner_text().find('نقطة التجمع') >= 0)
    page.get_by_placeholder('مثال: محطة الدريس — طريق الملك فهد').fill('دوار الاختبار')
    page.get_by_role('button', name='نشر الطلعة').click(); page.wait_for_timeout(1200)
    check('نشر الطلعة والانتقال لصفحتها', '#/ride/' in page.url and page.locator('h2:has-text("طلعة اختبار")').count() == 1)
    check('المنظّم مشارك تلقائيًا', page.locator('.seg button.on.going').count() >= 1)
    check('بدون مسار: تنبيه النقاط فقط', page.locator('text=لم يُحسب مسار قيادة فعلي').count() == 1)

    # 5) حالة الطريق
    page.get_by_role('button', name='في الطريق').click(); page.wait_for_timeout(800)
    check('تحديث حالتي: في الطريق', 'في الطريق' in toast())

    # 6) تصويت على طلعة
    page.get_by_role('button', name='تصويت').click(); page.wait_for_timeout(400)
    page.get_by_placeholder('مثال: وين نروح الخميس؟').fill('وين نروح؟')
    ins = page.locator('.sheet input.input')
    ins.nth(1).fill('الثمامة'); ins.nth(2).fill('العمارية')
    page.get_by_role('button', name='نشر التصويت').click(); page.wait_for_timeout(900)
    page.locator('.poll-opt', has_text='الثمامة').click(); page.wait_for_timeout(900)
    check('التصويت يسجّل صوتًا واحدًا', page.locator('.poll-opt.mine').count() == 1)
    page.locator('.poll-opt', has_text='العمارية').click(); page.wait_for_timeout(900)
    check('تغيير الصوت يبقي صوتًا واحدًا', page.locator('.poll-opt.mine', has_text='العمارية').count() == 1 and page.locator('.poll-opt.mine').count() == 1)
    page.screenshot(path=f'{S}/flow_ride.png', full_page=True)

    # 7) إنشاء دعوة
    page.goto(BASE + '#/admin?tab=invites'); page.wait_for_timeout(900)
    page.get_by_role('button', name='إنشاء دعوة جديدة').click(); page.wait_for_timeout(300)
    page.get_by_role('button', name='إنشاء الدعوة').click(); page.wait_for_timeout(900)
    code = page.locator('.code-display').inner_text() if page.locator('.code-display').count() else ''
    import re
    check(f'إنشاء دعوة بكود 10 رموز ({code})', bool(re.fullmatch(r'[A-Z2-9]{10}', code)))
    page.keyboard.press('Escape')

    # 8) قبول عضو
    page.goto(BASE + '#/admin'); page.wait_for_timeout(800)
    page.get_by_role('button', name='قبول').click(); page.wait_for_timeout(900)
    check('قبول طلب الانضمام', 'تم قبول' in toast())

    # 9) مشاركة الموقع: تحتاج موافقة
    page.goto(BASE + '#/me'); page.wait_for_timeout(800)
    page.get_by_role('button', name='شارك موقعي').click(); page.wait_for_timeout(300)
    page.get_by_role('button', name='ابدأ المشاركة').click(); page.wait_for_timeout(300)
    check('بدون موافقة لا تبدأ المشاركة', page.locator('.sheet .form-error').inner_text().find('الموافقة') >= 0)
    page.locator('.sheet input[type=checkbox]').check()
    page.get_by_role('button', name='ابدأ المشاركة').click(); page.wait_for_timeout(1200)
    check('المشاركة تبدأ ويظهر زر الإيقاف', page.locator('text=إيقاف مشاركة الموقع').count() == 1)
    page.screenshot(path=f'{S}/flow_share.png')
    page.get_by_role('button', name='إيقاف مشاركة الموقع').click(); page.wait_for_timeout(800)
    check('الإيقاف يعيد الحالة «متوقفة»', page.locator('text=متوقفة').count() >= 1)

    # 10) طلب مساعدة: طلب مفتوح واحد
    page.goto(BASE + '#/help/new'); page.wait_for_timeout(700)
    page.get_by_role('button', name='أرسل طلب المساعدة').click(); page.wait_for_timeout(300)
    check('نوع المشكلة مطلوب', 'اختر نوع' in page.locator('.form-error').inner_text())
    page.get_by_role('button', name='عطل').click()
    page.locator('input[type=checkbox]').check(); page.wait_for_timeout(1200)
    page.get_by_role('button', name='أرسل طلب المساعدة').click(); page.wait_for_timeout(1200)
    check('إرسال طلب المساعدة', '#/help' in page.url and 'تم نشر طلبك' in toast())
    page.goto(BASE.replace('?preview=1','?preview=1&x=1') + '#/help/new'); page.wait_for_timeout(600)

    # 11) سطح المكتب
    ctx2 = b.new_context(viewport={'width':1280,'height':800}, locale='ar-SA', timezone_id='Asia/Riyadh')
    p2 = ctx2.new_page(); p2.goto(BASE + '#/home'); p2.wait_for_timeout(1200)
    p2.screenshot(path=f'{S}/desktop_home.png')
    p2.goto(BASE + '#/chat'); p2.wait_for_timeout(1000); p2.screenshot(path=f'{S}/desktop_chat.png')
    b.close()
print('\n'.join(log)); print('JS errors:', errs)
