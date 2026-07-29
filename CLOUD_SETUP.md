# Growth OS cloud setup — Spark plan

Growth OS uses GitHub Pages for its public URL and Firebase's free Spark plan
for individual authentication and shared organization data.

## Active Firebase project

- Project name: `Growth OS`
- Project ID: `growth-os-3bd53`
- Firestore region: `asia-northeast1`
- Authentication: Email/Password
- Billing plan: Spark (`$0`)

The visible login remains a Growth OS personal ID plus a four-digit PIN.
Internally, the browser derives a non-identifying Firebase email and a strong
PBKDF2 password. Neither the PIN nor its plain text is stored in Firestore.

## Services intentionally not used

- Cloud Functions
- Cloud Storage
- Firebase App Hosting
- Any paid Google Cloud service

Images are stored only when each Firestore document remains below the
application's 850 KB safety limit. Large images must stay on the device or be
compressed before sharing.

## First Management account

The first account is created once in the Firebase console:

1. Derive the internal email and password with
   `GROWTH_LOGIN_ID=... GROWTH_PIN=.... node scripts/derive-growth-credentials.mjs`.
2. Add that email/password user in Firebase Authentication.
3. Copy its Firebase UID.
4. Create `growth_accounts/{uid}` in Firestore with:
   - `organizationId`: `growth-os`
   - `memberId`: `management-legacy-1`
   - `role`: `management`
   - `loginId`: the chosen Growth OS ID
   - `displayName`: `小畑`
   - `staffIds`: `["staff-legacy-1"]`
   - `active`: `true`
   - `memberActive`: `true`

After that Management login, all Staff, Support, and additional Management
accounts are created from Growth OS itself.

## Deployment

Deploy Firestore security rules:

```sh
firebase deploy --only firestore:rules --project growth-os-3bd53
```

The GitHub Pages workflow publishes the app after changes reach `main`.
