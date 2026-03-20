# 📱 Android Studio Setup Guide — Sales CRM APK

## Method 1: TWA (Trusted Web Activity) — RECOMMENDED

TWA wraps your hosted PWA as a native Android APK. No code duplication.

### Step 1: Deploy PWA to GitHub Pages

```bash
# In your sales-crm project folder:
npm install
npm run build

# Install gh-pages
npm install -D gh-pages

# Add to package.json scripts section:
"homepage": "https://YOUR_GITHUB_USERNAME.github.io/sales-crm",
"predeploy": "npm run build",
"deploy": "gh-pages -d dist"

# Deploy
npm run deploy
```

Your app is now live at: `https://YOUR_GITHUB_USERNAME.github.io/sales-crm`

---

### Step 2: Create Android Studio Project

1. Open Android Studio
2. **File → New → New Project**
3. Select **"No Activity"**
4. Set package: `com.yourcompany.salescrm`
5. Min SDK: API 21 (Android 5.0)
6. Click Finish

---

### Step 3: Configure Dependencies

In `app/build.gradle`:
```gradle
android {
    compileSdk 34
    defaultConfig {
        applicationId "com.yourcompany.salescrm"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }
}

dependencies {
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
}
```

---

### Step 4: Configure AndroidManifest.xml

Replace `app/src/main/AndroidManifest.xml` with:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <application
        android:label="Sales CRM"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <activity
            android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
            android:exported="true">

            <meta-data
                android:name="android.support.customtabs.trusted.DEFAULT_URL"
                android:value="https://YOUR_GITHUB_USERNAME.github.io/sales-crm" />

            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https"
                    android:host="YOUR_GITHUB_USERNAME.github.io"
                    android:pathPrefix="/sales-crm" />
            </intent-filter>
        </activity>

    </application>
</manifest>
```

---

### Step 5: Add App Icon

1. Right-click `app/src/main/res` → New → Image Asset
2. Upload your logo (use `DCC Logo Back.png`)
3. Generate all icon sizes

---

### Step 6: Generate Signed APK

1. **Build → Generate Signed Bundle / APK**
2. Select **APK**
3. Click **Create new...** for keystore:
   - Keystore path: Save somewhere safe (e.g. `~/keystore/sales-crm.jks`)
   - Password: Strong password
   - Alias: `sales-crm-key`
   - ⚠️ SAVE THESE DETAILS — needed for updates!
4. Select **release**
5. Build!

APK output: `app/release/app-release.apk`

---

### Step 7: Install & Test

```bash
# Via USB (enable USB debugging on phone)
adb install app/release/app-release.apk

# Or transfer the APK file directly to phone and install
```

---

## Method 2: WebView App (Offline-capable)

If you want fully offline support without needing a hosted URL:

### MainActivity.java
```java
package com.yourcompany.salescrm;

import android.os.Bundle;
import android.webkit.*;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.loadUrl("https://YOUR_GITHUB_USERNAME.github.io/sales-crm");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
```

---

## Checklist Before Building APK

- [ ] PWA deployed on public HTTPS URL
- [ ] manifest.json has correct icons (192x192, 512x512)
- [ ] Service Worker working (test in Chrome DevTools → Application)
- [ ] AndroidManifest.xml has correct URL
- [ ] App icon added
- [ ] Keystore credentials saved securely
- [ ] Test on physical Android device
