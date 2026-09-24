# ماژول Auth

احراز هویت با JWT: access کوتاه‌عمر (Bearer) + refresh با rotation (کوکی httpOnly محدود به `/api/v1/auth`).

| Endpoint | شرح |
|---|---|
| `POST /auth/register-tenant` | ثبت فروشگاه: در یک تراکنش Tenant + شعبه مرکزی + گدام پیش‌فرض + کاربر Admin + اشتراک FREE + ماژول‌های هسته ساخته می‌شود |
| `POST /auth/login` | ورود با ایمیل/رمز |
| `POST /auth/refresh` | تمدید نشست از کوکی؛ توکن قبلی باطل (rotation)؛ استفاده مجدد → ابطال همه نشست‌ها |
| `POST /auth/logout` | خروج و پاک کردن refresh |
| `GET /auth/me` | پروفایل + لیست permission ها |

رمز عبور: bcryptjs (۱۰ round). Payload توکن: `{ sub, tenantId, roleId, roleKey }`.
