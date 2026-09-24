# ماژول Products

محصولات با ۴ نوع قیمت (خرید/فروش/عمده/تخفیفی)، ارز AFN/USD + نرخ تبدیل، حداقل موجودی، تخفیف درصدی، SKU/Barcode یکتا per tenant.

- ایجاد: تراکنشی — محصول + Stock صفر در همه گدام‌ها + PriceHistory اولیه
- ویرایش: هر تغییر قیمت با oldPrice/newPrice/کاربر در PriceHistory همان تراکنش
- `GET /products/:id/price-history` تاریخچه کامل
- حذف: soft-delete
- QR/Barcode: payload از روی SKU در فرانت تولید می‌شود
