# TestFlight (iOS) – Stax

Steps to build and ship Stax to TestFlight for beta testers.

## Prerequisites

- **Apple Developer account** ([developer.apple.com](https://developer.apple.com)) – required for App Store Connect and TestFlight.
- **Expo account** – sign up at [expo.dev](https://expo.dev) (used by EAS Build).
- **Bundle ID** – in `app.json`, `expo.ios.bundleIdentifier` is set to `com.stax.app`. Change it if you use a different identifier (e.g. `com.yourcompany.stax`). It must match the App ID in your Apple Developer account.

## First-time setup

1. **EAS CLI** – Either install globally (`npm install -g eas-cli`) or use the project’s dev dependency and run:
   ```bash
   npm install
   npm run build:ios    # or: npx eas build --platform ios --profile production
   ```

2. **Log in to Expo**:
   ```bash
   eas login
   ```

3. **Configure the project for EAS** (once per project):
   ```bash
   eas build:configure
   ```
   This uses your existing `eas.json`; you can accept the defaults.

4. **Create the app in App Store Connect** (if not already done):
   - Go to [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
   - Choose **iOS**, name (e.g. **Stax**), primary language, bundle ID (must match `app.json`), SKU.

5. **Environment variables for production builds**  
   Any `EXPO_PUBLIC_*` vars you need in the app (e.g. Supabase, RevenueCat, API keys) must be set for EAS Build:
   - **Expo dashboard**: [expo.dev](https://expo.dev) → your project → **Secrets** (or **Environment variables**).
   - Or use **EAS Secrets**: `eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."` (and similarly for other keys).  
   Only set non-sensitive, build-time values here; never commit `.env` with real secrets.

## Build and submit to TestFlight

From the project root:

```bash
# Build iOS production (store) and auto-submit to TestFlight
eas build --platform ios --profile production --auto-submit
```

Or in two steps:

```bash
# 1. Build
eas build --platform ios --profile production

# 2. After the build finishes, submit the latest build
eas submit --platform ios --profile production --latest
```

- First run will prompt for **Apple ID** and may ask to create an **App Store Connect API Key** (recommended) or use app-specific password.
- **Build number** is auto-incremented by EAS for the `production` profile (`eas.json` → `ios.autoIncrement: "buildNumber"`).
- After upload, the build appears in App Store Connect → **TestFlight**. Once processed, add internal/external testers and they’ll get the build.

## NPM scripts

- `npm run build:ios` – production iOS build (no submit).
- `npm run submit:ios` – submit latest iOS build to TestFlight.

## App icon

For App Store and TestFlight, use a **1024×1024 px** icon. Set `expo.icon` in `app.json` to that asset; Expo will generate all required sizes. Current asset: `./assets/icon.png`.

## Troubleshooting

- **“No valid code signing”** – EAS will offer to create/manage credentials; choose “Let EAS manage” for the simplest path.
- **“Bundle ID doesn’t match”** – Ensure `expo.ios.bundleIdentifier` in `app.json` matches the App ID in Apple Developer and the app in App Store Connect.
- **Build fails on EAS** – Check the build log in the Expo dashboard; common causes are missing env vars or Node/npm version. You can pin `node` in `eas.json` under the build profile if needed.

## References

- [EAS Build – iOS production build](https://docs.expo.dev/build-reference/ios-builds/)
- [EAS Submit – Apple App Store / TestFlight](https://docs.expo.dev/submit/ios/)
- [Expo app config – `app.json`](https://docs.expo.dev/workflow/configuration/)
