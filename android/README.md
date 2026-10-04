# LifeStats Android app (Trusted Web Activity)

This is a thin Android wrapper around the live website (`https://lifestats.fun`).
It contains no app logic: it opens the site full-screen in Chrome via a
[Trusted Web Activity](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activity)
(TWA) using [androidbrowserhelper](https://github.com/GoogleChrome/android-browser-helper).
Website deploys update the app instantly; no Play Store release is needed.

| Setting | Where |
| --- | --- |
| Website host, start path, package name, version | [`gradle.properties`](./gradle.properties) |
| App name / theme color | `app/src/main/res/values/` |
| Icons / splash | `app/src/main/res/mipmap-*`, `drawable-xxxhdpi/splash.png` |

## Requirements

- JDK 17+ and the Android SDK (easiest: install Android Studio and open this
  `android/` folder).

## Build

```powershell
cd android
.\gradlew.bat assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Install on a phone with USB debugging enabled: `adb install -r app\build\outputs\apk\debug\app-debug.apk`.

### Release (Play Store / sideload)

1. Create an upload key once and keep it safe (never commit it):

   ```powershell
   keytool -genkeypair -v -keystore lifestats-upload.jks -alias lifestats -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Provide signing values as environment variables (or `-P` Gradle properties):
   `LIFESTATS_KEYSTORE_PATH`, `LIFESTATS_KEYSTORE_PASSWORD`, `LIFESTATS_KEY_ALIAS`,
   `LIFESTATS_KEY_PASSWORD`.
3. Build: `.\gradlew.bat bundleRelease assembleRelease -PtwaVersionCode=2`
   - `app-release.aab` → upload to Play Console
   - `app-release.apk` → sideload

CI ([`.github/workflows/android.yml`](../.github/workflows/android.yml)) builds the
same artifacts on manual dispatch or `android-v*` tags. Add repository secrets
`ANDROID_KEYSTORE_BASE64` (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("lifestats-upload.jks"))`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`;
without them CI produces a debug APK only.

## Remove the browser URL bar (Digital Asset Links)

Chrome shows the app full-screen only after verifying that the website trusts the
app's signing certificate. The site serves `/.well-known/assetlinks.json` from
environment variables (see `app/.well-known/assetlinks.json/route.ts`):

```
ANDROID_PACKAGE_NAME=fun.lifestats.app
ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:...,CC:DD:...
```

Add the SHA-256 of every certificate that signs installed builds (comma-separated):

- Debug: `keytool -list -v -keystore $env:USERPROFILE\.android\debug.keystore -alias androiddebugkey -storepass android`
- Upload key: `keytool -list -v -keystore lifestats-upload.jks -alias lifestats`
- Play App Signing: Play Console → Test and release → App integrity → App signing key certificate

Redeploy the website, then confirm at
<https://developers.google.com/digital-asset-links/tools/generator>. Until it
verifies, the app still works but shows a small URL bar.

## Notes

- Requires Chrome (or another TWA-capable browser) on the device; otherwise it
  falls back to a Custom Tab.
- Login, cookies, and the on-device microphone behave exactly as in Chrome.
- Change `twaApplicationId` before the first Play Store upload only; it is permanent afterwards.
