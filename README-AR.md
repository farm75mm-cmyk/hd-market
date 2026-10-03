# HD Market على Railway (التطبيق + لوحة التحكم)

## ما في هذه الحزمة
- `public/index.html`: واجهة التطبيق (ويب) مرتبطة بالخادم.
- `public/api/`: واجهة PHP (تسجيل، دخول، ملف المستخدم والصورة، استعادة كلمة المرور).
- `public/admin/`: لوحة التحكم (المستخدمون، الإحصاءات، حظر، كلمة مرور مؤقتة، حذف).
- `Dockerfile` و`railway.json`: لتشغيلها على Railway. الجداول تُنشأ تلقائيًا في أول طلب.

## خطوات النشر
1. أنشئ مستودعًا **خاصًا** على GitHub وارفع إليه محتويات هذا المجلد.
2. في Railway: New Project ← Deploy from GitHub repo ← اختر المستودع.
3. في المشروع: New ← Database ← **MySQL**.
4. في خدمة التطبيق ← Variables أضف:
   | المتغير | القيمة |
   |---|---|
   | `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` |
   | `APP_SECRET` | نص عشوائي طويل (32 حرفًا أو أكثر) |
   | `ADMIN_USER` | اسم مدير اللوحة |
   | `ADMIN_PASSWORD` | كلمة مرور قوية (12 حرفًا أو أكثر) |
   | `RESEND_API_KEY` | مفتاح خدمة resend.com لإرسال كود الاستعادة |
   | `MAIL_FROM` | `HD Market <no-reply@دومينك>` (دومين موثّق في Resend) |
5. Settings ← Networking ← **Generate Domain**.
6. التطبيق على `/` ولوحة التحكم على `/admin/`.

## ملاحظات
- بدون `ADMIN_USER` و`ADMIN_PASSWORD` تبقى اللوحة معطّلة.
- بدون `RESEND_API_KEY` لا يصل كود استعادة كلمة المرور؛ يمكنك من اللوحة إنشاء كلمة مرور مؤقتة للمستخدم.
- لا تضع `DEBUG_RETURN_CODE=1` في الإنتاج (للاختبار فقط).
- حدّد `ALLOWED_ORIGIN` بدومين تطبيقك إذا استخدمت الواجهة من دومين آخر.
