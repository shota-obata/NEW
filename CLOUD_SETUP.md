# Growth OS cloud setup

Growth OS uses GitHub Pages for the public web URL and Firebase for server-side
ID/PIN authentication plus shared organization data.

## Required Firebase services

1. Create a Firebase project in the Tokyo region where applicable.
2. Register a Web app and copy its `firebaseConfig` into
   `growth-cloud-config.js`.
3. Create Cloud Firestore.
4. Upgrade the Firebase project to Blaze before deploying 2nd generation
   Cloud Functions. Set budget alerts before deployment.
5. Sign in with Firebase CLI.
6. Set the one-time bootstrap key:
   `firebase functions:secrets:set GROWTH_BOOTSTRAP_KEY`
7. Deploy:
   `firebase deploy --only functions,firestore:rules`
8. Bootstrap the first Management account once through the
   `bootstrapGrowth` callable function.
9. Change `enabled` to `true` in `growth-cloud-config.js`.

The bootstrap function refuses to run after an organization or first account
already exists.
