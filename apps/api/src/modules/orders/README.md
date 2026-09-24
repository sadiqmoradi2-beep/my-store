# ماژول Orders

چرخه سفارش با ماشین وضعیت مشترک (`@my-store/shared`):

```
PENDING → APPROVED | CANCELLED
APPROVED → READY | CANCELLED
READY → SHIPPING | CANCELLED
SHIPPING → DELIVERED
DELIVERED → RETURNED
```

- ایجاد: snapshot نام/قیمت/بهای تمام‌شده (unitCost) هر قلم + `orderNumber` افزایشی per-tenant — همه در یک تراکنش
- `POST /orders/:id/transition`: گذار غیرمجاز → 422؛ APPROVED = کسر موجودی از گدام پیش‌فرض شعبه (کمبود → رد کامل)؛ CANCELLED-بعد-از-تأیید و RETURNED = برگشت موجودی (RETURN_IN)
- هر گذار در OrderStatusHistory با کاربر و یادداشت ثبت می‌شود
