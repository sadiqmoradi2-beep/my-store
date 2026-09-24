# ماژول Inventory

موجودی per (محصول × گدام) + دفتر حرکت‌ها (StockMovement با quantity مثبت؛ جهت از type).

- `POST /inventory/in|out|adjust` — تراکنشی؛ موجودی منفی → 422
- `POST /inventory/transfer` — اتمیک: کسر مبدأ + افزایش مقصد، دو حرکت جفت با `transferId`
- `GET /inventory/low-stock` — موجودی ≤ حداقل تعریف‌شده محصول
- `GET /inventory/movements` — تاریخچه صفحه‌بندی‌شده

تابع `applyMovement` نقطه واحد تغییر موجودی است؛ ماژول orders هم از همان استفاده می‌کند (`referenceType/referenceId`).
