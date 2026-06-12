# Google OAuth setup (7a-side)

Manual steps in Google Cloud Console. Required before social sign-in works in dev or production.

## 1. OAuth consent screen

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → OAuth consent screen.
2. User type: **External**.
3. App name: **7a-side**, support email, developer contact.
4. Scopes: `openid`, `email`, `profile`.
5. Add test users while in **Testing** mode, or **Publish** for production.

## 2. Create OAuth 2.0 Client IDs

APIs & Services → Credentials → Create credentials → OAuth client ID.

| Type | Name | Configuration |
|------|------|---------------|
| **Web** | 7a-side Web | Authorized JavaScript origins: `https://seven-aside.phantommetrics.gm`, `http://localhost:8081`. Authorized redirect URIs: same origins **exactly** (see below). |
| **iOS** | 7a-side iOS | Bundle ID: `com.sevenaside.app` |
| **Android** | 7a-side Android | Package: `com.sevenaside.app`, SHA-1 from EAS/production keystore |

### Android SHA-1

```bash
cd appFrontend
npx eas-cli credentials -p android
```

Or copy SHA-1 from Google Play Console → Release → App signing.

## 3. Environment variables

**Frontend** (`appFrontend/.env` — copy from `.env.example`):

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

**Backend** (`appBackend/.env`):

```env
GOOGLE_CLIENT_IDS=your-web-client-id.apps.googleusercontent.com
```

Use the **Web** client ID for backend audience validation.

### Redirect URI (fix `redirect_uri_mismatch`)

When you tap “Continue with Google” in dev, the browser console logs:

```text
[Google sign-in] redirectUri = http://localhost:8081
```

Add that **exact** URI under the Web OAuth client → **Authorized redirect URIs**. For production, add `https://seven-aside.phantommetrics.gm` (no trailing slash unless the log shows one). Google requires an exact match.

Also add the same URLs under **Authorized JavaScript origins**.

## 4. Restart Expo after changing `.env`

Client IDs are read from `appFrontend/.env` at startup. After editing env vars:

```bash
cd appFrontend
# Stop the running dev server (Ctrl+C), then:
npm run web
```

If you deployed a web build **before** adding the Google env vars, rebuild with `npm run build:web`.

## 5. EAS builds (native)

OAuth client IDs are baked in at build time via `app.config.js`. After setting `.env`:

```bash
cd appFrontend
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

OTA updates alone are **not** enough for first OAuth enablement if native config changed.

## 6. Web PWA deploy

Set the same `EXPO_PUBLIC_GOOGLE_*` vars in the build environment, then:

```bash
npm run build:web
```

Deploy `dist/` to `https://seven-aside.phantommetrics.gm`.

## 7. iOS App Store (Sign in with Apple)

If you ship Google sign-in on iOS, Apple [Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple) typically requires **Sign in with Apple** as well. The backend already exposes `POST /auth/apple`; add Apple UI before App Store submission if you keep Google on iOS.

Android and Web have no equivalent requirement.

## 8. Smoke test checklist

- [ ] New Google user → lands in Main, `UserInfoScreen` shows provider `google`
- [ ] Returning Google user → sign-in works
- [ ] Email account with same address → rejected with “sign in with email”
- [ ] Web PWA on production domain → Google popup completes
- [ ] Email register/login still works
