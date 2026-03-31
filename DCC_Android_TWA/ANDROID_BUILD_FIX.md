# Android Build Fix Guide

## What Was Fixed

### Error 1: `Theme.AppCompat.Light.NoActionBar` not found
**Root cause:** `app/build.gradle` was missing the `appcompat` library dependency.
The theme parent `Theme.AppCompat.Light.NoActionBar` in `styles.xml` requires
the `androidx.appcompat` package — it's not included transitively by `androidbrowserhelper`.

**Fix applied:** Added to `app/build.gradle` dependencies:
```gradle
implementation 'androidx.appcompat:appcompat:1.7.0'
implementation 'androidx.core:core:1.13.1'
implementation 'androidx.browser:browser:1.8.0'
```

### Error 2: Incompatible Gradle JVM
**Root cause:** AGP 8.2.2 has known JVM compatibility issues.

**Fix applied:**
- Upgraded AGP: `8.2.2` → `8.3.2` in `build.gradle`
- Pinned Gradle: `8.4` in `gradle/wrapper/gradle-wrapper.properties`
- Added `gradle.properties` with proper JVM args and `useAndroidX=true`

---

## Steps to Build APK in Android Studio

### Step 1 — Set JDK 17
`File → Project Structure → SDK Location → JDK Location`
- Set to: **Android Studio's bundled JDK** (usually inside Android Studio install folder)
- On Windows: `C:\Program Files\Android\Android Studio\jbr`
- On Mac: `/Applications/Android Studio.app/Contents/jbr/Contents/Home`

### Step 2 — Sync Gradle
Click **"Sync Now"** in the yellow bar, or:
`File → Sync Project with Gradle Files`

Wait for sync to complete (downloads ~50MB first time).

### Step 3 — Update Your URL
In `app/build.gradle`, update `hostName` and `defaultUrl` to your actual Vercel URL:
```gradle
hostName  : "crm-dcc.vercel.app",       // ← your actual domain
defaultUrl: "https://crm-dcc.vercel.app/",
```

### Step 4 — Build Debug APK (for testing)
`Build → Build Bundle(s) / APK(s) → Build APK(s)`

APK location: `app/build/outputs/apk/debug/app-debug.apk`

### Step 5 — Install on Phone
Connect phone via USB (enable USB Debugging in Developer Options), then:
```
adb install app/build/outputs/apk/debug/app-debug.apk
```
Or just copy the APK to phone and open it.

---

## For Signed Release APK

### Generate Keystore (one time only)
```bash
keytool -genkey -v \
  -keystore keystore/dcc-release.jks \
  -alias dcc-key \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

### Update build.gradle
Uncomment and fill `signingConfigs.release` in `app/build.gradle`:
```gradle
signingConfigs {
    release {
        storeFile     file("keystore/dcc-release.jks")
        storePassword "your_store_password"
        keyAlias      "dcc-key"
        keyPassword   "your_key_password"
    }
}
```

### Build Release APK
`Build → Generate Signed Bundle/APK → APK → Release`

---

## Minimum Requirements
| Item | Required |
|------|----------|
| Android Studio | Hedgehog (2023.1.1) or newer |
| JDK | 17 (use bundled JDK) |
| Gradle | 8.4 (auto-downloaded) |
| AGP | 8.3.2 |
| Android SDK | API 34 |
| Min Device | Android 7.0 (API 24) |
