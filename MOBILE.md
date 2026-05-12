# spaacetime — iOS Development Workflow

The `ios/` folder is **fully committed** to the repository. You do NOT need to run `npx cap add ios`.

## Prerequisites

- macOS with **Xcode 15+** installed
- Node.js 18+
- An Apple Developer account (for physical device testing)

## Local Setup (first time)

```bash
git clone <repo-url>
cd spaacetime
npm install
npm run build
npx cap sync ios
```

## Daily Workflow

```bash
git pull
npm install        # only if dependencies changed
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Then select your device/simulator in Xcode and press **Run** (⌘R).

## Hot-Reload (optional)

To preview live changes from the Lovable sandbox on your device, edit `capacitor.config.ts` and uncomment the `server.url` line. Then run `npx cap sync ios` and rebuild in Xcode.

**Important:** Comment the URL back out before committing.

## Plugins Included

| Plugin | Package |
|--------|---------|
| App lifecycle | `@capacitor/app` |
| Browser (OAuth) | `@capacitor/browser` |
| Local Notifications | `@capacitor/local-notifications` |

## Troubleshooting

- **Git conflicts in `ios/`**: Run `git checkout -- ios/App/App/public ios/App/App/capacitor.config.json ios/App/App/config.xml` — these are generated files and safe to discard.
- **Plugin not found**: Run `npx cap sync ios` to regenerate native plugin bindings.
- **Build fails in Xcode**: Clean build folder (⌘⇧K), then rebuild.

## In-App Purchase (iOS)

The iOS app uses Apple In-App Purchase for subscriptions instead of Stripe (App Store policy).

### One-time setup in App Store Connect

1. Create the app record (Bundle ID `com.spacetimelabs.spacetime`) if not already.
2. **Features → Subscriptions** → create subscription group "Spacetime".
3. Add subscription product:
   - **Product ID**: `com.spacetimelabs.spacetime.monthly`
   - **Reference Name**: Spacetime Monthly
   - **Subscription Duration**: 1 Month
   - **Price**: $1.99 (Tier 2) — closest to the $2/mo target
4. Add an **Introductory Offer**:
   - Type: **Free**, Duration: **1 Month**, Eligibility: **New Subscribers**
5. Fill in the localized display name + description (App Review will reject without these).
6. App Information → **App Store Server Notifications**:
   - Production URL: `https://rhguyvbysqmcwzeuqipr.supabase.co/functions/v1/apple-iap-notifications`
   - Sandbox URL: same
   - Version: **2** (V2 JWS notifications)
7. Generate a **Sandbox Tester** account (Users and Access → Sandbox) for testing.

### One-time setup in Xcode

1. Open `ios/App/App.xcworkspace`.
2. Target **App** → Signing & Capabilities → **+ Capability** → **In-App Purchase**.
3. Sign in to your Apple Developer team.

### After pulling code changes

```bash
npm install
npm run build
npx cap sync ios
```

### Testing

- Run on a physical iPhone (sandbox IAP doesn't work in the simulator for purchase flows).
- Settings → App Store → Sandbox Account → sign in with sandbox tester.
- Tap **START FREE TRIAL** in the paywall — purchase sheet appears.
- Verify in your backend: a row in `subscriptions` should appear with `payment_source = 'apple_iap'` and `status = 'active'`.
- **RESTORE PURCHASES** should re-link an existing subscription on a fresh install.
