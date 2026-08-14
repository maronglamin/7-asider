# 7a-side → BiReport SavedReport pack

Paste each block into **BiReport → Report Builder** against a Postgres datasource pointing at `night_games_db`.

**Params (half-open range):** `:dateFrom`, `:dateToExclusive`  
**Settlement fee:** `:platformFeePerHour` (contract default `100` — GMD per booked hour owed to 7a-side)  
**Optional filters:** `:fieldId?`, `:ownerId?`, `:city?`, `:minBookings` (repeat bookers; use `2` if unsure)

Prisma tables are quoted PascalCase (`"Booking"`, `"fieldId"`, …). Do not unquote.

**Manual settlement model:** booker pays field price → owner collects gross → 7a-side earns fixed `:platformFeePerHour` × paid hours → owner keeps the rest. Period is based on `"BookingUnit"."date"` (hours used).

---

## 1. [7a] Revenue & collections (period)

| Field | Value |
|-------|--------|
| **Name** | `[7a] Revenue & collections (period)` |
| **Category** | `FINANCIAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Period GMV: paid vs unpaid vs cancelled. Bind KPI widgets to `collected_gmd` / `outstanding_gmd`. |

```sql
SELECT
  COUNT(*) FILTER (WHERE b."status" <> 'CANCELLED') AS booking_count,
  COUNT(*) FILTER (WHERE b."status" <> 'CANCELLED' AND b."paymentStatus" = 'PAID') AS paid_count,
  COUNT(*) FILTER (WHERE b."status" <> 'CANCELLED' AND b."paymentStatus" = 'UNPAID') AS unpaid_count,
  COALESCE(SUM(b."totalAmount") FILTER (
    WHERE b."status" <> 'CANCELLED' AND b."paymentStatus" = 'PAID'
  ), 0) AS collected_gmd,
  COALESCE(SUM(b."totalAmount") FILTER (
    WHERE b."status" <> 'CANCELLED' AND b."paymentStatus" = 'UNPAID'
  ), 0) AS outstanding_gmd,
  COALESCE(SUM(b."totalAmount") FILTER (WHERE b."status" = 'CANCELLED'), 0) AS cancelled_gmd
FROM "Booking" b
WHERE b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
  [[AND b."fieldId" = :fieldId?]];
```

---

## 2. [7a] Earnings by field

| Field | Value |
|-------|--------|
| **Name** | `[7a] Earnings by field` |
| **Category** | `FINANCIAL` |
| **Visualization** | `BAR_CHART` |
| **Description** | Paid non-cancelled earnings ranked by field. Chart label = `field_name`, value = `total_earnings_gmd`. |

```sql
SELECT
  f."name" AS field_name,
  COALESCE(SUM(b."totalAmount"), 0) AS total_earnings_gmd,
  COUNT(*) AS paid_bookings,
  f."city",
  f."id" AS field_id
FROM "Booking" b
JOIN "FieldKyc" f ON f."id" = b."fieldId"
WHERE b."paymentStatus" = 'PAID'
  AND b."status" <> 'CANCELLED'
  AND b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
  [[AND f."city" = :city?]]
GROUP BY f."id", f."name", f."city"
ORDER BY total_earnings_gmd DESC;
```

---

## 3. [7a] Daily booking & revenue trend

| Field | Value |
|-------|--------|
| **Name** | `[7a] Daily booking & revenue trend` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `LINE_CHART` |
| **Description** | Daily bookings and collected GMD. Chart label = `day`. |

```sql
SELECT
  (b."createdAt" AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) FILTER (WHERE b."status" <> 'CANCELLED') AS bookings,
  COUNT(*) FILTER (WHERE b."paymentStatus" = 'PAID' AND b."status" <> 'CANCELLED') AS paid_bookings,
  COALESCE(SUM(b."totalAmount") FILTER (
    WHERE b."paymentStatus" = 'PAID' AND b."status" <> 'CANCELLED'
  ), 0) AS collected_gmd
FROM "Booking" b
WHERE b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
GROUP BY 1
ORDER BY 1;
```

---

## 4. [7a] Unpaid collections queue

| Field | Value |
|-------|--------|
| **Name** | `[7a] Unpaid collections queue` |
| **Category** | `FINANCIAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Open unpaid bookings with receipt flag for chase list. |

```sql
SELECT
  b."id" AS booking_id,
  b."createdAt",
  b."startAt",
  b."endAt",
  b."totalAmount",
  b."status",
  b."paymentStatus",
  f."name" AS field_name,
  u."email" AS booker_email,
  u."name" AS booker_name,
  EXISTS (
    SELECT 1 FROM "PaymentReceipt" pr WHERE pr."bookingId" = b."id"
  ) AS has_receipt,
  (
    SELECT MAX(pr."createdAt")
    FROM "PaymentReceipt" pr
    WHERE pr."bookingId" = b."id"
  ) AS last_receipt_at
FROM "Booking" b
JOIN "FieldKyc" f ON f."id" = b."fieldId"
JOIN "User" u ON u."id" = b."userId"
WHERE b."paymentStatus" = 'UNPAID'
  AND b."status" <> 'CANCELLED'
  AND b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
  [[AND b."fieldId" = :fieldId?]]
ORDER BY b."createdAt" ASC;
```

---

## 5. [7a] Field utilization (hours booked)

| Field | Value |
|-------|--------|
| **Name** | `[7a] Field utilization (hours booked)` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `BAR_CHART` |
| **Description** | Occupancy via BookingUnit grain. Chart label = `field_name`, value = `hours_booked`. |

```sql
SELECT
  f."name" AS field_name,
  COUNT(*) AS hours_booked,
  COUNT(DISTINCT u."date") AS days_with_bookings,
  f."city",
  f."id" AS field_id
FROM "BookingUnit" u
JOIN "Booking" b ON b."id" = u."bookingId"
JOIN "FieldKyc" f ON f."id" = u."fieldId"
WHERE b."status" <> 'CANCELLED'
  AND u."date" >= CAST(:dateFrom AS timestamp)
  AND u."date" < CAST(:dateToExclusive AS timestamp)
  [[AND u."fieldId" = :fieldId?]]
  [[AND f."city" = :city?]]
GROUP BY f."id", f."name", f."city"
ORDER BY hours_booked DESC;
```

---

## 6. [7a] Peak demand by hour

| Field | Value |
|-------|--------|
| **Name** | `[7a] Peak demand by hour` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `BAR_CHART` |
| **Description** | Hours booked by UTC hour bucket (0–23). Chart label = `hour_utc`. |

```sql
SELECT
  u."hourStart" AS hour_utc,
  COUNT(*) AS hours_booked
FROM "BookingUnit" u
JOIN "Booking" b ON b."id" = u."bookingId"
WHERE b."status" <> 'CANCELLED'
  AND u."date" >= CAST(:dateFrom AS timestamp)
  AND u."date" < CAST(:dateToExclusive AS timestamp)
  [[AND u."fieldId" = :fieldId?]]
GROUP BY u."hourStart"
ORDER BY u."hourStart";
```

---

## 7. [7a] Field KYC pipeline

| Field | Value |
|-------|--------|
| **Name** | `[7a] Field KYC pipeline` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `PIE_CHART` |
| **Description** | Supply-side status mix. Chart label = `status`, value = `fields`. |

```sql
SELECT
  f."status"::text AS status,
  COUNT(*) AS fields,
  COUNT(*) FILTER (WHERE f."hasLights") AS with_lights,
  ROUND(AVG(f."pricePerHour")::numeric, 2) AS avg_price_per_hour
FROM "FieldKyc" f
GROUP BY f."status"
ORDER BY fields DESC;
```

---

## 8. [7a] KYC backlog detail

| Field | Value |
|-------|--------|
| **Name** | `[7a] KYC backlog detail` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Pending and suspended fields for admin follow-up. |

```sql
SELECT
  f."id",
  f."name",
  f."city",
  f."pricePerHour",
  f."status"::text AS status,
  f."createdAt",
  owner."email" AS owner_email,
  owner."easypayBusinessId" IS NOT NULL AS easypay_linked
FROM "FieldKyc" f
JOIN "User" owner ON owner."id" = f."userId"
WHERE f."status" IN ('PENDING', 'SUSPENDED')
ORDER BY f."createdAt" ASC;
```

---

## 9. [7a] Booking status & type mix

| Field | Value |
|-------|--------|
| **Name** | `[7a] Booking status & type mix` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Funnel by status × type × paymentStatus for the period. |

```sql
SELECT
  b."status"::text AS status,
  b."type"::text AS type,
  b."paymentStatus"::text AS payment_status,
  COUNT(*) AS bookings,
  COALESCE(SUM(b."totalAmount"), 0) AS amount_gmd
FROM "Booking" b
WHERE b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
GROUP BY b."status", b."type", b."paymentStatus"
ORDER BY bookings DESC;
```

---

## 10. [7a] Booking status mix (chart)

| Field | Value |
|-------|--------|
| **Name** | `[7a] Booking status mix (chart)` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `PIE_CHART` |
| **Description** | Simplified status breakdown for dashboard pie. Chart label = `status`. |

```sql
SELECT
  b."status"::text AS status,
  COUNT(*) AS bookings
FROM "Booking" b
WHERE b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
GROUP BY b."status"
ORDER BY bookings DESC;
```

---

## 11. [7a] Repeat bookers

| Field | Value |
|-------|--------|
| **Name** | `[7a] Repeat bookers` |
| **Category** | `CUSTOMERS` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Top spenders/repeat customers. Set filter `minBookings` (e.g. `2`). |

```sql
SELECT
  u."email",
  u."name",
  COUNT(*) AS bookings,
  COUNT(*) FILTER (WHERE b."paymentStatus" = 'PAID') AS paid_bookings,
  COALESCE(SUM(b."totalAmount") FILTER (WHERE b."paymentStatus" = 'PAID'), 0) AS spent_gmd,
  MIN(b."createdAt") AS first_booking_at,
  MAX(b."createdAt") AS last_booking_at,
  u."id" AS user_id
FROM "Booking" b
JOIN "User" u ON u."id" = b."userId"
WHERE b."status" <> 'CANCELLED'
  AND b."createdAt" >= CAST(:dateFrom AS timestamp)
  AND b."createdAt" < CAST(:dateToExclusive AS timestamp)
GROUP BY u."id", u."email", u."name"
HAVING COUNT(*) >= CAST(:minBookings AS int)
ORDER BY spent_gmd DESC, bookings DESC
LIMIT 100;
```

---

## 12. [7a] Owner payout readiness

| Field | Value |
|-------|--------|
| **Name** | `[7a] Owner payout readiness` |
| **Category** | `OPERATIONAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Field owners with Easypay link and bank/wallet payout accounts. |

```sql
SELECT
  owner."email",
  owner."name",
  owner."easypayBusinessId" IS NOT NULL AS easypay_linked,
  owner."easypaySlug",
  COUNT(DISTINCT f."id") FILTER (WHERE f."status" = 'APPROVED') AS approved_fields,
  COUNT(DISTINCT ba."id") AS bank_accounts,
  COUNT(DISTINCT wa."id") AS wallet_accounts,
  owner."id" AS owner_id
FROM "User" owner
LEFT JOIN "FieldKyc" f ON f."userId" = owner."id"
LEFT JOIN "BankAccount" ba ON ba."userId" = owner."id"
LEFT JOIN "WalletAccount" wa ON wa."userId" = owner."id"
WHERE EXISTS (
  SELECT 1 FROM "FieldKyc" fx WHERE fx."userId" = owner."id"
)
GROUP BY owner."id", owner."email", owner."name", owner."easypayBusinessId", owner."easypaySlug"
ORDER BY approved_fields DESC, easypay_linked DESC;
```

---

## 13. [7a] Settlement — per field owner collection

| Field | Value |
|-------|--------|
| **Name** | `[7a] Settlement — per field owner collection` |
| **Category** | `FINANCIAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Manual settlement worksheet: one row per field owner. Gross from paid bookings (prorated to hours in period), 7a commission = paid_hours × platformFeePerHour, owner_net = gross − commission. Set `platformFeePerHour` to `100` unless contract differs. |

```sql
WITH period_hours AS (
  SELECT
    u."bookingId",
    u."fieldId",
    COUNT(*)::int AS hours_in_period
  FROM "BookingUnit" u
  JOIN "Booking" b ON b."id" = u."bookingId"
  WHERE b."paymentStatus" = 'PAID'
    AND b."status" <> 'CANCELLED'
    AND u."date" >= CAST(:dateFrom AS timestamp)
    AND u."date" < CAST(:dateToExclusive AS timestamp)
  GROUP BY u."bookingId", u."fieldId"
),
booking_hours AS (
  SELECT
    u."bookingId",
    COUNT(*)::int AS total_hours
  FROM "BookingUnit" u
  JOIN period_hours ph ON ph."bookingId" = u."bookingId"
  GROUP BY u."bookingId"
),
lines AS (
  SELECT
    f."userId" AS owner_id,
    ph.hours_in_period,
    (
      b."totalAmount"::numeric
      * ph.hours_in_period
      / NULLIF(bh.total_hours, 0)
    ) AS gross_gmd,
    (ph.hours_in_period * CAST(:platformFeePerHour AS numeric)) AS platform_commission_gmd
  FROM period_hours ph
  JOIN booking_hours bh ON bh."bookingId" = ph."bookingId"
  JOIN "Booking" b ON b."id" = ph."bookingId"
  JOIN "FieldKyc" f ON f."id" = ph."fieldId"
  WHERE 1 = 1
    [[AND f."userId" = :ownerId?]]
)
SELECT
  owner."name" AS owner_name,
  owner."email" AS owner_email,
  COUNT(*) AS paid_bookings_in_period,
  SUM(l.hours_in_period)::int AS paid_hours,
  ROUND(SUM(l.gross_gmd), 2) AS gross_collected_gmd,
  ROUND(SUM(l.platform_commission_gmd), 2) AS platform_commission_gmd,
  ROUND(SUM(l.gross_gmd) - SUM(l.platform_commission_gmd), 2) AS owner_net_gmd,
  CAST(:platformFeePerHour AS numeric) AS fee_per_hour_gmd,
  owner."id" AS owner_id,
  owner."easypayBusinessId" IS NOT NULL AS easypay_linked,
  (
    SELECT COUNT(*)::int FROM "BankAccount" ba WHERE ba."userId" = owner."id"
  ) AS bank_accounts,
  (
    SELECT COUNT(*)::int FROM "WalletAccount" wa WHERE wa."userId" = owner."id"
  ) AS wallet_accounts
FROM lines l
JOIN "User" owner ON owner."id" = l.owner_id
GROUP BY
  owner."id",
  owner."name",
  owner."email",
  owner."easypayBusinessId"
ORDER BY platform_commission_gmd DESC, gross_collected_gmd DESC;
```

---

## 14. [7a] Settlement — owner collection by field

| Field | Value |
|-------|--------|
| **Name** | `[7a] Settlement — owner collection by field` |
| **Category** | `FINANCIAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Same settlement math, split by owner × field for payout breakdown. |

```sql
WITH period_hours AS (
  SELECT
    u."bookingId",
    u."fieldId",
    COUNT(*)::int AS hours_in_period
  FROM "BookingUnit" u
  JOIN "Booking" b ON b."id" = u."bookingId"
  WHERE b."paymentStatus" = 'PAID'
    AND b."status" <> 'CANCELLED'
    AND u."date" >= CAST(:dateFrom AS timestamp)
    AND u."date" < CAST(:dateToExclusive AS timestamp)
  GROUP BY u."bookingId", u."fieldId"
),
booking_hours AS (
  SELECT
    u."bookingId",
    COUNT(*)::int AS total_hours
  FROM "BookingUnit" u
  JOIN period_hours ph ON ph."bookingId" = u."bookingId"
  GROUP BY u."bookingId"
),
lines AS (
  SELECT
    f."userId" AS owner_id,
    f."id" AS field_id,
    f."name" AS field_name,
    f."city",
    ph.hours_in_period,
    (
      b."totalAmount"::numeric
      * ph.hours_in_period
      / NULLIF(bh.total_hours, 0)
    ) AS gross_gmd,
    (ph.hours_in_period * CAST(:platformFeePerHour AS numeric)) AS platform_commission_gmd
  FROM period_hours ph
  JOIN booking_hours bh ON bh."bookingId" = ph."bookingId"
  JOIN "Booking" b ON b."id" = ph."bookingId"
  JOIN "FieldKyc" f ON f."id" = ph."fieldId"
  WHERE 1 = 1
    [[AND f."userId" = :ownerId?]]
    [[AND f."id" = :fieldId?]]
)
SELECT
  owner."name" AS owner_name,
  owner."email" AS owner_email,
  l.field_name,
  l.city,
  COUNT(*) AS paid_bookings_in_period,
  SUM(l.hours_in_period)::int AS paid_hours,
  ROUND(SUM(l.gross_gmd), 2) AS gross_collected_gmd,
  ROUND(SUM(l.platform_commission_gmd), 2) AS platform_commission_gmd,
  ROUND(SUM(l.gross_gmd) - SUM(l.platform_commission_gmd), 2) AS owner_net_gmd,
  CAST(:platformFeePerHour AS numeric) AS fee_per_hour_gmd,
  owner."id" AS owner_id,
  l.field_id
FROM lines l
JOIN "User" owner ON owner."id" = l.owner_id
GROUP BY
  owner."id",
  owner."name",
  owner."email",
  l.field_id,
  l.field_name,
  l.city
ORDER BY owner."email", platform_commission_gmd DESC;
```

---

## 15. [7a] Settlement — booking detail (owner)

| Field | Value |
|-------|--------|
| **Name** | `[7a] Settlement — booking detail (owner)` |
| **Category** | `FINANCIAL` |
| **Visualization** | `TABLE_ONLY` |
| **Description** | Line-level settlement audit: each paid booking’s hours in period, prorated gross, 7a fee, owner net. Filter `ownerId` when settling one owner. |

```sql
WITH period_hours AS (
  SELECT
    u."bookingId",
    u."fieldId",
    COUNT(*)::int AS hours_in_period
  FROM "BookingUnit" u
  JOIN "Booking" b ON b."id" = u."bookingId"
  WHERE b."paymentStatus" = 'PAID'
    AND b."status" <> 'CANCELLED'
    AND u."date" >= CAST(:dateFrom AS timestamp)
    AND u."date" < CAST(:dateToExclusive AS timestamp)
  GROUP BY u."bookingId", u."fieldId"
),
booking_hours AS (
  SELECT
    u."bookingId",
    COUNT(*)::int AS total_hours
  FROM "BookingUnit" u
  JOIN period_hours ph ON ph."bookingId" = u."bookingId"
  GROUP BY u."bookingId"
)
SELECT
  owner."name" AS owner_name,
  owner."email" AS owner_email,
  f."name" AS field_name,
  b."id" AS booking_id,
  b."startAt",
  b."endAt",
  b."totalAmount" AS booking_total_gmd,
  bh.total_hours AS booking_total_hours,
  ph.hours_in_period,
  ROUND(
    b."totalAmount"::numeric * ph.hours_in_period / NULLIF(bh.total_hours, 0),
    2
  ) AS gross_in_period_gmd,
  ROUND(ph.hours_in_period * CAST(:platformFeePerHour AS numeric), 2) AS platform_commission_gmd,
  ROUND(
    (
      b."totalAmount"::numeric * ph.hours_in_period / NULLIF(bh.total_hours, 0)
    ) - (ph.hours_in_period * CAST(:platformFeePerHour AS numeric)),
    2
  ) AS owner_net_gmd,
  booker."email" AS booker_email,
  owner."id" AS owner_id,
  f."id" AS field_id
FROM period_hours ph
JOIN booking_hours bh ON bh."bookingId" = ph."bookingId"
JOIN "Booking" b ON b."id" = ph."bookingId"
JOIN "FieldKyc" f ON f."id" = ph."fieldId"
JOIN "User" owner ON owner."id" = f."userId"
JOIN "User" booker ON booker."id" = b."userId"
WHERE 1 = 1
  [[AND f."userId" = :ownerId?]]
  [[AND f."id" = :fieldId?]]
ORDER BY owner."email", b."startAt", b."id";
```

---

## Paste order (recommended)

1. `[7a] Settlement — per field owner collection` — **P0 settlement**  
2. `[7a] Settlement — owner collection by field` — P0 settlement drilldown  
3. `[7a] Settlement — booking detail (owner)` — P0 audit  
4. `[7a] Revenue & collections (period)` — P0 KPI  
5. `[7a] Earnings by field` — P0 bar  
6. `[7a] Unpaid collections queue` — P0 table  
7. `[7a] Daily booking & revenue trend` — P0 line  
8. `[7a] Field utilization (hours booked)` — P1  
9. `[7a] Peak demand by hour` — P1  
10. `[7a] Booking status mix (chart)` + `[7a] Booking status & type mix` — P1  
11. `[7a] Field KYC pipeline` + `[7a] KYC backlog detail` — P2  
12. `[7a] Repeat bookers` — P2  
13. `[7a] Owner payout readiness` — P2  

## Datasource checklist

- Host/port → 7a-side Postgres  
- Database → `night_games_db`  
- Read-only DB user preferred  
- Org in BiReport dedicated to 7a-side / 9Games  
