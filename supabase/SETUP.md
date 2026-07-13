# Account Page — Setup

This wires up the real account flow used by `account.html` — sign in, **download my
data**, and **delete my account**. (`delete-account.html` now just redirects to
`account.html`, so any deletion URL you've shared still works.)

```
account.html  ──sign in (Google / Apple / email)──▶  Supabase Auth   (anon key, public)
     │
     ├──invoke("export-data")  with the user's JWT──▶  Edge Function  (service_role, secret)
     │                                                     └─ returns the user's data as JSON
     │
     └──invoke("delete-account") with the user's JWT──▶  Edge Function  (service_role, secret)
                                                            ├─ verifies the caller
                                                            ├─ deletes their app data
                                                            └─ deletes the auth user
```

## 1. Fill in the public config

In `delete-account.html`, find the `CONFIG` block and set:

```js
const SUPABASE_URL      = 'https://YOURPROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';        // anon public key
const PROVIDERS         = ['google', 'email'];  // matches what's enabled in your project
```

Both values come from **Project Settings → API**. They are public by design — safe to commit.
**Never** put the `service_role` key in this file or anywhere in the repo.

## 2. Allow the site to redirect back after sign-in

Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, add:

- `https://studio.determinix.com/delete-account.html`
- `http://localhost:8000/delete-account.html` (for local testing with `./preview.sh`)

Set **Site URL** to `https://studio.determinix.com`.

## 3. Deploy the Edge Function

Install the CLI (`npm i -g supabase`) once, then from the repo root:

```bash
supabase login
supabase link --project-ref rjnqvzcfvguxsxrotldd
supabase functions deploy delete-account
supabase functions deploy export-data
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the Supabase runtime — you do **not** set them manually.

## 4. Tell the function what to delete

Open both `supabase/functions/delete-account/index.ts` and
`supabase/functions/export-data/index.ts` and keep their `USER_TABLES` lists in sync:

- If your tables have a foreign key to `auth.users` with **`ON DELETE CASCADE`**,
  the delete function can leave `USER_TABLES` empty — deleting the auth user cascades.
- Otherwise, list each table + its user-id column so delete clears them and export
  includes them.
- You currently have **no custom tables**, so both lists are empty: deletion removes
  the auth user, and export returns the account profile. Fill them in when you add
  game-data tables.

Also confirm `ALLOWED_ORIGINS` lists your live domain in both files.

## 5. Test

1. `./preview.sh`, open `http://localhost:8000/delete-account.html`.
2. Sign in with Google (or request an email link).
3. Use a **throwaway test account** and click *Delete my account*.
4. Verify in the Supabase dashboard (Authentication → Users) that the user is gone.

## 6. Apple / App Store requirements (important)

- **In-app deletion is required.** App Store Review Guideline **5.1.1(v)** says an app
  that supports account creation must let users **start deletion from inside the app**.
  This web page is a *supplement*, not a substitute. Add a "Delete Account" button in
  the game that calls the same `delete-account` Edge Function.
- **Account Deletion URL.** In App Store Connect you can provide this page's URL
  (`https://studio.determinix.com/delete-account.html`) as the account-deletion link.
- **Sign in with Apple (Guideline 4.8).** Because the app offers Google sign-in, Apple
  generally requires a privacy-preserving login option too — **Sign in with Apple** is
  the expected choice. `account.html` already lists `'apple'` in `PROVIDERS`, so the
  Apple button appears as soon as the provider works. To make it work you must:
  1. In the **Apple Developer** portal: create a **Service ID**, enable Sign in with
     Apple, add `https://rjnqvzcfvguxsxrotldd.supabase.co/auth/v1/callback` as the
     Return URL, and create a **Sign in with Apple key** (.p8).
  2. In **Supabase → Authentication → Providers → Apple**: enable it and paste the
     Service ID, Team ID, Key ID, and the .p8 key.

  Until Apple is fully configured, the Apple button will error if clicked. If you want
  to hide it in the meantime, remove `'apple'` from `PROVIDERS` in `account.html`.
