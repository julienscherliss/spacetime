# Release Spacetime to all three clients

Keep GPT-6 Sol / Medium for routine releases. Use High only for a failed check or a new data/auth/billing change. Read `outputs/MIGRATION_HANDOFF.md` in the coordinator workspace for the current checkpoint. No new agents, repeated migration audit or public App Store submission.

## Review first, package second, publish last

For a proposed change, start a local preview with `npm run review` and open
`http://127.0.0.1:5174/`. Edits update the preview immediately. This does not build,
sign, notarize, upload, install, or publish a release, and does not change release
versions or overwrite packaged assets. The regular app preview uses the configured
backend: signing into your account and editing tasks still syncs real account data.
For testing destructive or unusual cases, provide a separate sample-data preview
without mounting Auth/data-sync rather than modifying the owner's schedule.

Use three explicit checkpoints:

1. **Review:** implement locally, run focused checks for the changed behavior, and
   show the preview. Stop here for owner feedback. Save the change, evidence,
   preview URL/server state, and next action in the coordinator handoff.
2. **Package:** after owner approval, prepare the single shared build and Mac/iOS
   packages below. Use an unsigned development Mac app or iOS Simulator only when
   the change needs native-device behavior; ordinary UI/store changes start with
   the browser preview.
3. **Distribute:** after an explicit instruction to distribute, publish the website,
   Mac download and internal TestFlight build. Keep public App Store release
   separate. Do not infer distribution approval from a request to implement or
   preview a new feature. Batch approved fixes into one release when practical.

Keep GPT-6 Sol / Medium for routine review/release work and carry the same handoff
through all three checkpoints; no separate chats or general migration retests.

## One source, one shared build

Routine releases now use two commands, with review before packaging and an explicit
distribution instruction before publication:

```sh
npm run release -- package
npm run release -- distribute
```

`package` prepares the shared build, checks the website candidate, signs/notarizes
the Mac package, and archives iOS. It does not upload or publish. `distribute`
checks that every package is ready and hosting main has not changed, then uploads
internal TestFlight, pushes the prepared website commit, and publishes the Mac
download/update assets. Either command stops on the first failure. Rerun the same
command after fixing that stage; its saved receipts reuse completed work.

The remaining operator steps are choosing unused release versions and committing
the approved source, clicking Lovable **Publish changes**, checking Apple's
processed build is available to the internal group, and a short check of the changed
behavior. Dashboard sign-in may be needed. After Lovable publishes, run
`npm run release -- verify-web`. Replacing a locally installed Mac app still needs
sync/quit and a private backup; it is separate from publishing its download.
For this task-editor release, check the physical iPhone keyboard after installation.
Public App Store release remains deferred. No scheduled or unattended publishing
is configured by these commands.

Update `release.config.json` with the next Mac version, unused internal iOS build number, and the **previous successfully published shared source commit** as `webBaseSource`. Bump `electron/package.json` and both root version fields in its lockfile to that Mac version. Commit and push the shared source branch. Confirm the iOS number in App Store Connect. Run focused tests for changed behavior once before packaging; do not rerun the full migration smoke suite for an ordinary frontend patch.

Individual stages remain available for troubleshooting from the app repository:

```sh
npm run release -- prepare
npm run release -- web
npm run release -- mac
npm run release -- ios
npm run release -- upload-ios
npm run release -- status
```

`prepare` builds production web assets once, copies identical bytes into Electron and syncs iOS. Mac and iOS stages verify the packaged assets against that saved manifest. Mac signing/notarization requires existing `APPLE_ID` and `APPLE_APP_PASSWORD` environment credentials; never paste credentials into a command or commit. iOS uploads are **internal TestFlight only**, with app/widget build numbers kept identical. Existing Xcode signing is used.

Private logs and a small resumable receipt live in `.migration-private/releases/<mac>-ios<ios>/`. Completed stages reuse verified artifacts on the same clean source commit. `status` is the first command after a pause; read only its receipt and the failed stage's log, not the whole repository/export. If source changes, use new release versions rather than reusing a receipt. If dist was overwritten, restore the saved build or deliberately start a new release.

## Publish the prepared release

Give the owner a heads-up. For persistence changes, have them finish syncing and close old website tabs. Have them sync and quit the Mac app before replacing an installed bundle; preserve a private closed-app/user-data backup and never clear its cache or downgrade a newer journal.

```sh
npm run release -- push-web
npm run release -- publish-mac
```

`web` applies only the shared frontend/release-tool delta to fresh hosting `origin/main` using an alternate index. Backend/native trees remain unchanged. A conflict or moved main stops the operation for focused reconciliation. Never push the entire migration branch to main; **do not use `sync:main` for distribution**.

In Lovable's existing Spacetime project, click **Publish → Publish changes** after GitHub main updates. This one hosting step still needs the dashboard. Then:

```sh
npm run release -- verify-web
```

This follows the actual live app asset graph, verifies the cache module and worker against the prepared code while ignoring generated chunk names, checks the interaction/Limbo repair invariants and backend/credential boundaries, and saves actual published asset hashes. Lovable rebuilds/minifies chunks differently; whole-bundle byte identity is not claimed. A cache/worker or invariant mismatch stops verification. Finish with one bounded rendered startup/navigation/reopen check; expand testing only for changed behavior or a concrete failure. `publish-mac` uploads all five updater/download assets to a draft, verifies their GitHub hashes, then publishes a coherent latest release. The website uses GitHub's latest Mac download; confirm its actual link once after publication.

In App Store Connect, wait for the uploaded build to process and appear as **Internal / Testing / Mission Control**. Record that status in the private receipt; an upload alone is not availability. Update through TestFlight on the phone. Public App Store release remains a separate, deferred decision.

## Finish and carry context forward

Record the source commit, hosting commit, three published versions/statuses and any remaining user action at the top of coordinator `outputs/MIGRATION_HANDOFF.md`. Set the next release's `webBaseSource` to this receipt's **source** commit, not the hosting commit. Keep a concise receipt: build/test evidence, package/asset hashes, publication status and next action. A normal subsequent release should require these stages, one hosting click and one bounded reopen/Limbo/task-drop check—not another backend migration.
