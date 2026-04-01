# Sales CRM Android Setup

This project now uses Capacitor as the Android wrapper, so the app opens like a native mobile app without the Chrome/TWA bar.

## Project Shape

```text
Sales_CRM_DCC-main/
├── android/
├── public/
├── src/
├── capacitor.config.ts
├── package.json
├── vite.config.ts
└── index.html
```

## What Is Configured

- Capacitor app name: `Sales CRM`
- Capacitor app id: `com.dcc.salescrm`
- Web build directory: `dist`
- Native Android project: `android/`
- Fullscreen immersive launch in `MainActivity.java`
- Splash screen configured in `capacitor.config.ts`
- Permissions added for internet, location, camera, and media reads
- Cleartext traffic allowed for environments that still use HTTP APIs

## Local Commands

Install dependencies:

```bash
npm install
```

Build the web app:

```bash
npm run build
```

Sync web assets into Android:

```bash
npm run cap:sync:android
```

Open Android Studio:

```bash
npm run cap:open:android
```

## Generate Debug APK

1. Run `npm run build`
2. Run `npm run cap:sync:android`
3. Run `npm run cap:open:android`
4. In Android Studio wait for Gradle sync to finish
5. Go to `Build -> Build Bundle(s) / APK(s) -> Build APK(s)`
6. Android Studio will show the APK output link when the build completes

Typical APK output path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Generate Signed APK or AAB for Play Store

1. Open the `android/` project in Android Studio
2. Go to `Build -> Generate Signed Bundle / APK`
3. Choose:
   - `APK` for direct install testing
   - `Android App Bundle` for Play Store upload
4. Create or choose your keystore
5. Fill:
   - Key store path
   - Key alias
   - Passwords
6. Choose `release`
7. Finish the wizard and wait for the build

Release outputs usually appear in:

```text
android/app/build/outputs/apk/release/
android/app/build/outputs/bundle/release/
```

## App Icon and Splash Screen

For best results use your high-resolution square logo, ideally 1024x1024 PNG.

Recommended update path:

1. In Android Studio right-click `app`
2. Choose `New -> Image Asset`
3. Generate:
   - launcher icon
   - round icon
4. Use the generated assets for all densities

Splash screen behavior is already configured in `capacitor.config.ts`. If you want branded splash artwork, replace the Android splash drawable assets inside:

```text
android/app/src/main/res/drawable*
```

## Permissions Included

The Android manifest includes:

- `INTERNET`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `READ_MEDIA_IMAGES`
- `READ_MEDIA_VIDEO`
- `CAMERA`

These support current CRM needs and future GPS and file-upload workflows.

## Fullscreen Behavior

Fullscreen immersive mode is implemented in:

- `android/app/src/main/java/com/dcc/salescrm/MainActivity.java`

This hides status and navigation bars and keeps the app feeling native.

## Notes

- After every web UI change, rebuild and re-sync before generating a fresh APK
- If your backend uses HTTP during internal testing, `usesCleartextTraffic` is already enabled
- If you later add native file pickers or push notifications, Capacitor plugins can be added without changing the overall app structure
