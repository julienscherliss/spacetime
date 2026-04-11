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
