# 📱 DCC SalesForce — Android APK Generation Guide

## Overview
This app is a **Progressive Web App (PWA)**. The best way to generate an APK is using
**Bubblewrap / TWA (Trusted Web Activity)** which wraps your deployed Vercel URL as a
real native Android APK — same tech used by Twitter, Starbucks, and Pinterest.

---

## Prerequisites
Install these once on your machine:

| Tool | Download |
|------|----------|
| Node.js 18+ | https://nodejs.org |
| Java JDK 17 | https://adoptium.net |
| Android Studio | https://developer.android.com/studio |

---

## Step 1 — Deploy to Vercel (already done)
Your live URL: `https://sales-crm-dcc.vercel.app`

Make sure the site loads correctly before generating APK.

---

## Step 2 — Install Bubblewrap

Open PowerShell or Terminal:

```bash
npm install -g @bubblewrap/cli
```

---

## Step 3 — Initialize TWA Project

Create a new folder and run:

```bash
mkdir dcc-apk
cd dcc-apk
bubblewrap init --manifest https://sales-crm-dcc.vercel.app/manifest.json
```

When prompted, fill in:

| Field | Value |
|-------|-------|
| Domain | `sales-crm-dcc.vercel.app` |
| Application name | `DCC SalesForce` |
| Short name | `DCC SFA` |
| Package ID | `com.dcc.salesforce` |
| Version code | `1` |
| Version name | `1.0.0` |
| Min SDK version | `21` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Theme color | `#2563EB` |
| Background color | `#F5F7FB` |
| Start URL | `/` |
| Icon URL | `https://sales-crm-dcc.vercel.app/icons/icon-512.png` |

---

## Step 4 — Build the APK

```bash
bubblewrap build
```

This downloads Android SDK components automatically and produces:
- `app-release-signed.apk` → **install this on phones**
- `app-release-bundle.aab` → upload to Google Play Store

---

## Step 5 — Install on Android Phone

### Option A — Direct install (sideload):
1. Copy `app-release-signed.apk` to phone (USB or WhatsApp)
2. On phone: Settings → Security → **Enable "Install unknown apps"**
3. Open the APK file on phone → Install

### Option B — ADB install:
```bash
# Connect phone via USB with USB debugging on
adb install app-release-signed.apk
```

---

## Step 6 — Fix Digital Asset Links (removes browser bar)

For the app to run without Chrome address bar (true full-screen), add this file:

**File location in this project:** `public/.well-known/assetlinks.json`

Get your SHA-256 fingerprint:
```bash
keytool -list -v -keystore android.keystore
```

Update `public/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.dcc.salesforce",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT_HERE"]
  }
}]
```

Then redeploy to Vercel. The app will launch full-screen like a true native app.

---

## Alternative: PWABuilder (Easiest — no install needed)

1. Go to **https://www.pwabuilder.com**
2. Enter: `https://sales-crm-dcc.vercel.app`
3. Click **Package for stores**
4. Select **Android**
5. Download the APK

PWABuilder generates the APK in your browser — no tools needed.

---

## App Details

| Property | Value |
|----------|-------|
| App name | DCC SalesForce |
| Package | com.dcc.salesforce |
| Min Android | 5.0 (API 21) |
| Target Android | 14 (API 34) |
| Permissions | Internet, GPS, Camera, Notifications |

---

## Login Credentials (Production)

| Role | Username | Default Password |
|------|----------|-----------------|
| Admin | `admin` | `Admin@123` |

**After first login → go to Users tab → create your sales manager accounts.**
Change admin password from the Users tab for security.

---

## Troubleshooting

**"App not installed" error:** Enable unknown sources in phone settings.

**Browser bar still showing:** Digital asset links not configured. The app still works fully — just has a small Chrome bar on top.

**GPS not working in APK:** Android requires HTTPS for GPS — your Vercel URL is already HTTPS ✅

**White screen on launch:** Hard refresh in Chrome first, then reinstall APK.
