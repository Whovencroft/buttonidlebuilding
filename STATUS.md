# STATUS

## Current milestone
Milestone 25: Package for Android and iOS (blocked)

## Completed tasks
- Added Capacitor packaging configuration:
  - `capacitor.config.js`
  - package scripts/dependencies in `package.json` for `cap sync/open/doctor`
- Extended mobile lifecycle bridge for native wrappers:
  - `src/core/platform/PlatformService.js`
  - `src/core/platform/MobilePlatform.js`
  - host pause/resume now also listens for Capacitor `App` lifecycle events when running natively.

## Current task
Milestone 25 started. Capacitor sync and native launch verification are blocked in this environment.

## Blockers
- Capacitor CLI v6 in this Node 20 environment does not honor ESM `capacitor.config.js` (`webDir` falls back to default `www`), while Capacitor CLI v8 (which supports current config behavior) requires Node >=22.
- Native platform launch verification requires host OS toolchains unavailable in this container:
  - Android launch requires Android SDK/emulator or device and Gradle toolchain.
  - iOS launch requires macOS + Xcode + iOS simulator/device.
- Exact requirements to unblock:
  1. Use Node >=22 with Capacitor CLI v8 or convert config loading to a supported non-ESM format for CLI v6.
  2. Run on a machine with Android SDK (and for iOS, macOS with Xcode).
  3. Install dependencies and sync native projects: `npm install && npm run cap:sync`.
  4. Add/open native projects and launch:
     - Android: `npx cap add android` (first time), then `npm run cap:open:android` and run app.
     - iOS: `npx cap add ios` (first time), then `npm run cap:open:ios` and run app.
