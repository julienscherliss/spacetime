# App Store-Compliant Subscriptions

Goal: Keep Stripe on web/desktop, switch iOS to Apple In-App Purchase, unify access checks behind a single entitlement.

## 1. Database — unified entitlement

Add to `subscriptions` (don't break existing rows):
- `payment_source TEXT` — `'stripe' | 'apple_iap' | 'promo' | 'admin'`
- `apple_original_transaction_id TEXT UNIQUE` — Apple's stable subscription ID
- `apple_product_id TEXT`
- `apple_environment TEXT` — `'Sandbox' | 'Production'`
- `apple_latest_transaction_id TEXT`
- `apple_expires_at TIMESTAMPTZ`
- `apple_auto_renew BOOLEAN`

Backfill existing rows: `payment_source = 'stripe'` where `stripe_subscription_id IS NOT NULL`, `'admin'` where `lifetime_access`, else leave null (still on trial).

`hasAccess` logic in `useSubscription` already handles `status` + `current_period_end` + `lifetime_access`; Apple renewals will write to those same fields, so the hook needs no logic change. Just expose `payment_source` so the UI can show the right "manage" affordance.

## 2. Platform detection

Reuse `isNativePlatform()` from `src/utils/nativePlatform.ts`. Add `isIOSNative()` helper (`Capacitor.getPlatform() === 'ios' && isNativePlatform()`). Use it to gate Stripe vs Apple paywall everywhere.

## 3. iOS IAP plugin

Add `@squareetlabs/capacitor-subscriptions` (StoreKit 2 wrapper, MIT, actively maintained). Wraps:
- `getProductDetails(productId)`
- `purchaseProduct(productId)`
- `getCurrentEntitlements()` → for restore
- `getLatestTransaction(productId)` → returns signed JWS transaction we send to server

Configure single product in App Store Connect:
- Product ID: `com.spacetimelabs.spacetime.monthly`
- Price: $2/month
- Introductory offer: 30-day free trial (one-time, new subscribers)

User must create the product in App Store Connect — document this in `MOBILE.md`.

## 4. Paywall split

`src/components/Paywall.tsx` — branch on `isIOSNative()`:

**iOS variant** (`PaywallIOS.tsx`, new file):
- Single plan card: "30-day free trial, then $2/month"
- "Start Free Trial" button → `purchaseProduct` → POST signed JWS to `apple-iap-verify` edge function → on success, `onAccessGranted()`
- "Restore Purchases" button → `getCurrentEntitlements` → POST to same verify function
- Required disclosure text verbatim:
  > 30-day free trial, then $2/month. Payment will be charged to your Apple ID. Subscription renews automatically unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in Apple Subscriptions.
- Promo code input stays (server-validated, no IAP involvement)
- NO mention of Stripe, web, external links, monthly/yearly grid

**Web/desktop variant**: existing UI unchanged.

## 5. Settings panel

`src/components/SettingsPanel.tsx`:
- On iOS: hide "Manage Subscription" (Stripe customer portal) button. Replace with "Manage in Apple Subscriptions" link → `window.open('https://apps.apple.com/account/subscriptions', '_blank')`. Hide Stripe upgrade buttons; show same iOS paywall block when no access.
- On web/desktop: unchanged.
- If user's `payment_source === 'apple_iap'` while on web: show read-only status + "Manage in Apple Subscriptions" deep link, no portal button.

## 6. Edge functions

### `apple-iap-verify` (new)
POST `{ signedTransaction: string, signedRenewalInfo?: string }` from app.
- Verify JWS signature against Apple's public keys (use `jose` lib + Apple root CAs bundled in function)
- Extract `originalTransactionId`, `productId`, `expiresDate`, `environment`, `transactionId`
- Look up user from JWT auth header
- Upsert into `subscriptions` for that `user_id`:
  - `status = 'active'` if `expiresDate > now`, else `'expired'`
  - `payment_source = 'apple_iap'`
  - `current_period_end = expiresDate`
  - `apple_*` fields populated
- Return `{ ok: true, expiresAt }`

### `apple-iap-notifications` (new) — App Store Server Notifications V2 webhook
- Public endpoint (`verify_jwt = false` in `supabase/config.toml`)
- Receives `signedPayload`, verifies JWS, decodes `notificationType` + `data.signedTransactionInfo` + `signedRenewalInfo`
- Look up subscription row by `apple_original_transaction_id`
- Map notification types:
  - `SUBSCRIBED`, `DID_RENEW`, `OFFER_REDEEMED` → `status='active'`, update `current_period_end`
  - `DID_CHANGE_RENEWAL_STATUS` → update `apple_auto_renew`; if off and expired → `status='cancelling'`
  - `EXPIRED`, `GRACE_PERIOD_EXPIRED` → `status='expired'`
  - `REFUND`, `REVOKE` → `status='expired'`, clear access
  - `DID_FAIL_TO_RENEW` → keep `active` until `current_period_end` passes (Apple grace)
- URL goes into App Store Connect → App Information → App Store Server Notifications (production + sandbox)

### Stripe functions
Unchanged. Add safety: `stripe-checkout` keeps working from web; iOS just never calls it.

## 7. Secrets

Add via `add_secret`:
- `APPLE_BUNDLE_ID` = `com.spacetimelabs.spacetime`
- `APPLE_IAP_SHARED_SECRET` (from App Store Connect → App → App-Specific Shared Secret) — used as fallback for legacy verifyReceipt if needed
- `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (App Store Server API key, .p8 contents) — needed for server-to-server lookups (e.g. on restore when client only has originalTransactionId)

Will request these via `add_secret` after plan approval.

## 8. iOS native setup (user does once after pulling)

Document in `MOBILE.md`:
1. In Xcode → Signing & Capabilities → add **In-App Purchase** capability
2. App Store Connect → create subscription group "Spacetime", add product `com.spacetimelabs.spacetime.monthly` at $2/mo with 30-day intro offer
3. Add tester to Sandbox; sign in via Settings → App Store → Sandbox Account
4. `npm i && npx cap sync ios`

## 9. Testing path

- Web: existing Stripe flow untouched (regression check: subscribe still works)
- iOS sandbox: purchase → verify webhook hits → `subscriptions.status='active'` with `payment_source='apple_iap'`; restore button works after reinstall; cancel in sandbox account → `EXPIRED` notification flips status

## Out of scope

- Yearly plan on iOS (spec says $2/mo only)
- Migrating existing Stripe subs to Apple (not possible per Apple rules; users keep Stripe sub, both honored)
- Family sharing
