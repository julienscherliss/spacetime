

## Change trial from 7 days to 30 days site-wide

Three places need updating:

### 1. Database migration
The `subscriptions` table default for `trial_end` is `now() + interval '7 days'`. A migration will change this to `now() + interval '30 days'`.

```sql
ALTER TABLE public.subscriptions
  ALTER COLUMN trial_end SET DEFAULT (now() + interval '30 days');
```

### 2. Admin panel reset function
In `src/components/AdminPanel.tsx` (lines 117-125), the `resetTrial` function adds 7 days. Change to 30 days and update the toast message.

### 3. Landing page text
The landing page already shows "30 DAYS FREE" from a previous edit — no changes needed there.

### Files changed
- **New migration** — alter `trial_end` default to 30 days
- **`src/components/AdminPanel.tsx`** — `+ 7` → `+ 30`, toast message updated

