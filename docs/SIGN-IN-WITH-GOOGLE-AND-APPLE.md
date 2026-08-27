# Sign in with Google and Apple

Altier accepts Google and Apple accounts as a **way into an existing team
member**, never as a way to create one. That single decision is what makes it
safe to accept identity providers that anybody in the world can sign up with.

The flow:

1. An owner adds a person in **Settings → Team**, with their real email address.
2. That person presses *Continue with Google* on the sign-in page.
3. Google confirms who they are and that the address is verified.
4. Altier looks for a team member with that address. If there is one, the two
   are linked and they are signed in. If there is not, they are refused — with
   a message saying exactly which address did not match.

From then on the link is keyed on the provider's stable subject identifier, so
the person keeps their access even if they later change the address on their
Google account.

**What this means for you:** the email you type into Settings → Team is a
credential. Anyone who controls that mailbox at Google or Apple can sign in as
that team member. Type it carefully, and use `SSO_ALLOWED_DOMAINS` (below) if
you want to limit linking to your own domain.

Two things are deliberately closed:

- **Nobody can self-register.** A verified Google account with no matching team
  member gets a refusal, not an account.
- **Single sign-on is off during first run.** Until one account has a password,
  the seeded team members hold placeholder addresses that nobody has claimed.
  Set up the first account with a password, correct your own email in Settings,
  and then link.

---

## What you need before starting

| | Google | Apple |
|---|---|---|
| Cost | free | **$99/year** — Sign in with Apple requires a paid Apple Developer Program membership |
| Console | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/serviceId) |
| Works on `http://localhost` | yes | no — Apple requires an HTTPS redirect on a real domain |
| Time | about five minutes | about twenty, and a domain you control |

If you only want one of them, set only that one. The sign-in page draws a button
for each provider it has keys for and nothing for the others, so a half-finished
Apple setup never appears as a button that cannot work.

---

## The redirect URI

Both consoles ask for a redirect URI, and both reject it for a single wrong
character. Altier tells you exactly what to register: deploy first, then open

```
https://your-app.vercel.app/api/auth/providers
```

and copy the `redirectUri` it gives back. It looks like this:

```
https://your-app.vercel.app/api/auth/oauth/google/callback
https://your-app.vercel.app/api/auth/oauth/apple/callback
```

Set `PUBLIC_URL` to your app's address (`https://your-app.vercel.app`, no
trailing slash) so this stays right behind a proxy. Without it Altier reads the
address off the request headers, which is correct on Vercel but worth pinning
down once you have a custom domain.

Locally the dev server and the API are on different ports and Vite rewrites the
Host when it proxies, so `PUBLIC_URL` is not optional there — set it to the Vite
address:

```
PUBLIC_URL=http://127.0.0.1:5173 npm run api
VITE_API_TARGET=http://127.0.0.1:5199 npm run dev
```

---

## Google, step by step

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a project, or pick an existing one.
2. **APIs & Services → OAuth consent screen.** Choose **External** unless you
   have Google Workspace and want to keep this to your own organisation, in
   which case choose **Internal** and skip the verification section entirely.
   Fill in the app name, your support email, and the developer contact. You do
   not need to submit for verification: the only scopes here are `openid`,
   `email` and `profile`, which are non-sensitive, and an unverified app can
   sign in up to 100 people.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   Application type: **Web application**.
4. Under **Authorised redirect URIs**, add the `google` URI from above. Add a
   second one for `http://localhost:5199/api/auth/oauth/google/callback` if you
   want it working locally too.
5. Copy the **Client ID** and **Client secret**.

Set these in your host's environment variables:

```
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
PUBLIC_URL=https://your-app.vercel.app
```

Redeploy. The button appears.

---

## Apple, step by step

Sign in with Apple has more moving parts because Apple does not issue a client
secret — you sign one with a private key, and Altier regenerates it on every
exchange so there is nothing long-lived to rotate.

You need four values: a **Services ID**, your **Team ID**, a **Key ID**, and the
**private key** itself.

1. Join the [Apple Developer Program](https://developer.apple.com/programs/)
   ($99/year). There is no free tier for this.
2. **Certificates, Identifiers & Profiles → Identifiers → +.** Register an
   **App ID** first (Apple requires one as the primary identifier), enable
   **Sign in with Apple** on it, and save.
3. Register a second identifier, this time a **Services ID**. Give it a
   reverse-domain identifier such as `ug.co.altier.web` — **this is your
   `APPLE_CLIENT_ID`**, not the App ID.
4. Open the Services ID, tick **Sign in with Apple**, press **Configure**, and:
   - set the primary App ID to the one from step 2,
   - add your domain under **Domains and Subdomains** (`your-app.vercel.app`),
   - add the `apple` redirect URI from above under **Return URLs**.
5. **Keys → +.** Name it, tick **Sign in with Apple**, configure it against the
   same App ID, and register. Download the `.p8` file — **Apple lets you
   download it once**. Note the **Key ID** shown on that page.
6. Your **Team ID** is in the top right of the developer portal, and on the
   membership page.

```
APPLE_CLIENT_ID=ug.co.altier.web
APPLE_TEAM_ID=ABCDE12345
APPLE_KEY_ID=KEYID67890
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAgEA…\n-----END PRIVATE KEY-----"
```

The private key spans several lines and most hosting dashboards accept it either
with real newlines or with `\n` written out. Altier accepts both, and also
accepts the bare base64 with the `BEGIN`/`END` lines stripped off.

### The one thing to warn your team about

Apple offers **Hide My Email**, which hands out a per-app address ending in
`@privaterelay.appleid.com`. That address will never match a team member, so
Altier refuses it and says why. Tell people to choose **Share My Email** the
first time they link.

---

## Optional: limit which addresses may link

```
SSO_ALLOWED_DOMAINS=altier.co.ug,altier.com
```

With this set, only addresses at those domains can create a new link. Links that
already exist keep working. Leave it unset to allow any address that matches a
team member — which is the right setting if your staff use personal Gmail
accounts, as is common.

---

## Every environment variable

| Variable | Needed for | What it is |
|---|---|---|
| `PUBLIC_URL` | both | Your app's address, no trailing slash. Pins the redirect URI. |
| `GOOGLE_CLIENT_ID` | Google | From the Cloud Console OAuth client |
| `GOOGLE_CLIENT_SECRET` | Google | Same screen |
| `APPLE_CLIENT_ID` | Apple | The **Services ID**, e.g. `ug.co.altier.web` |
| `APPLE_TEAM_ID` | Apple | Ten characters, top right of the developer portal |
| `APPLE_KEY_ID` | Apple | Shown when you create the key |
| `APPLE_PRIVATE_KEY` | Apple | Contents of the `.p8` file |
| `SSO_ALLOWED_DOMAINS` | neither | Optional comma-separated allowlist |

Set none of them and Altier works exactly as before, with passwords only.

---

## Managing links

**Settings → Profile → Linked sign-in accounts** shows what is linked to your
account, when, and which address. You can unlink from there — except when it is
the only way in. An account with no password and one linked provider cannot
unlink that provider, because there would be nobody left able to open it.

If you only ever sign in with Google, the same screen lets you set a password
without needing a current one: your session is the proof. Worth doing, for the
day a provider is unreachable.

---

## When it does not work

Failures come back to the sign-in page with the reason spelled out, rather than
a generic "something went wrong". The ones you are likely to meet:

| Message | Cause |
|---|---|
| *No Altier team member uses …* | The address on the provider is not on anybody's team profile. Fix it in Settings → Team. |
| *redirect_uri_mismatch* | The URI registered in the console does not match, character for character. Compare against `/api/auth/providers`. |
| *That used Apple's "Hide My Email"* | Sign in again and choose **Share My Email**. |
| *That sign-in was started in a different browser* | The flow began somewhere else, or cookies are blocked. Start again from this browser. |
| *That sign-in link has already been used* | A refresh, a back button, or a link older than ten minutes. Start again. |
| *…is not set up on this deployment* | The environment variables are missing or incomplete. Check `/api/health`, which lists the providers it has keys for. |
| *Set up the first account with a password* | First run. Claim an account with a password first. |

---

## How it is put together

No authentication library. The flow is the OpenID Connect authorization-code
flow written directly against both providers in `server/oidc.ts`, using nothing
beyond `node:crypto` and `fetch` — about a hundred lines, against a dependency
that would otherwise see every credential passing through it.

| | |
|---|---|
| Flow | authorization code, with PKCE (S256) on Google |
| Replay | one-time `state` row in the database, deleted on use, ten-minute expiry |
| Browser binding | a second httpOnly cookie, hashed into the state row, so a state handed to somebody else is useless |
| Token | RS256 only — `alg` is pinned, so `none` and HMAC confusion are both refused |
| Checked | signature against the provider's published keys, issuer, audience, expiry, issued-at, and the nonce from this flow |
| Apple's secret | ES256 assertion signed per exchange, ten-minute lifetime |
| Keys | JWKS cached for an hour, refetched once on an unknown key id |
| Linking | (provider, subject) → team member; requires a verified email on first link only |

`npm run check:sso` mints forged tokens against the real verifier — unsigned,
HMAC-signed, signed by the wrong key, payload swapped after signing, addressed
to another app, expired, replayed from an older flow — and asserts each is
refused. `npm run smoke:api` covers the HTTP half: what is offered, what the
redirect actually asks for, and every way the callback can be lied to. Both run
in CI, and both were verified to fail when the protection they test is removed.
