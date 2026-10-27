# FlashBlank7 Studio

Single-owner online editor. Public site: https://flashblank7.github.io/.
Private content: https://github.com/FlashBlank7/flashblank7-site-content (must remain private).

## Local checks

Use Node 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm check
python scripts/validate-site.py
pnpm exec wrangler deploy --dry-run --config admin/wrangler.jsonc
```

`site-templates/` contains the original static HTML. `content/published.json` contains **only already public material**. `scripts/build-site.ts` never reads the private repository. `dist/` remains the only GitHub Pages upload directory. `admin/build/` is a separate Worker asset bundle and is ignored by Git.

## First deployment

1. Sign into your own Cloudflare account. Keep the account on Workers Free. Do not enable billing, R2, paid Workers or other paid services for this setup.
2. Use `pnpm exec wrangler login --use-keyring --scopes account:read user:read workers:write workers_scripts:write d1:write`. Windows may require `@napi-rs/keyring@1.3.0` in Wrangler's native keyring directory. Authentication credentials are stored by Wrangler; do not paste them into chat.
3. `pnpm exec wrangler d1 create flashblank7-studio`. Copy `admin/wrangler.jsonc` to ignored `admin/wrangler.local.jsonc`; fill in the returned database ID and your exact `APP_ORIGIN`, such as `https://flashblank7-studio.<your-subdomain>.workers.dev`. This file must contain only IDs/URLs, no secrets.
4. Apply the migration: `pnpm exec wrangler d1 migrations apply flashblank7-studio --remote --config admin/wrangler.local.jsonc`. Build with `pnpm build:admin`, then deploy with `pnpm exec wrangler deploy --config admin/wrangler.local.jsonc`. The initial unconfigured deployment rejects login/API access.
5. Register a **private GitHub App** under your own account at https://github.com/settings/apps/new. Set homepage to `APP_ORIGIN`, user authorization callback to `APP_ORIGIN/auth/callback`; disable webhooks and do not enable device flow. Repository permissions: Contents **Read and write**, Actions **Read-only**, Metadata read (automatic). No account permissions, Administration or Workflows write access. Install on **Only select repositories**: `FlashBlank7.github.io` and `flashblank7-site-content`.
6. Put the App ID, Client ID and Installation ID in the ignored local Wrangler config. Generate a client secret and a private key. Store them as `GITHUB_CLIENT_SECRET` and `GITHUB_PRIVATE_KEY` in the Worker's **Settings → Variables and Secrets**, type **Secret**. The key must be PKCS#8 (`BEGIN PRIVATE KEY`); use the helper below to convert and upload without printing or writing a converted key. Never put the downloaded key in a repository.
7. Redeploy the configured Worker. Sign in as GitHub user ID **122159986**; every other identity must be rejected. Enable GitHub 2FA in account security settings.
8. Complete the live acceptance checks below before treating the editor as production-ready.

Private key conversion/upload (paths are example placeholders):

```sh
node scripts/upload-app-key.mjs /absolute/path/to/downloaded-key.pem admin/wrangler.local.jsonc
```

The helper reads the existing downloaded key, converts it in memory, and pipes it to Wrangler. It does not print or save key material. Revoke old App keys in GitHub after rotation.

## Editing and publication

- Draft documents are JSON files in private `content/<id>.json`; Markdown bodies use `media:<sha256>.<extension>` references. Uploaded images are content addressed in private `media/`.
- Save carries the Git blob SHA as a revision. A stale version produces HTTP 409; the current editor contents are retained and can be downloaded before loading the remote version.
- Preparing a release pins selected revisions and writes an immutable snapshot under private `releases/`. Confirming checks those revisions again and takes the site's publication lock.
- Each authenticated `/step` request processes at most one media object or one commit stage. Closing the browser does not lose progress; use **Continue publication** in history. Only a final non-force ref update exposes the complete release on `main`.
- The intended commit is recorded before advancing `main`. If a response is lost, retry checks for that commit before attempting another update. Concurrent Git edits cause a conflict, never a force push.
- Publication state is **submitted → building → live/failed**. A successful save or Git push is not reported as a successful deployment. Refresh reads the named Pages workflow for the exact commit.
- Restore only accepts a known successful release, writes a new commit containing its content snapshot, and preserves code history. Removing published content does not erase Git history or external caches.
- Export downloads content and referenced media to your browser. For complete history and unused uploads, clone or download the private GitHub repository.

## Security model and boundaries

The browser never receives GitHub access tokens, installation tokens, App private keys or the client secret. GitHub's user token is used once to establish identity and is not persisted. Sessions are opaque random values; only their hashes are stored in D1. Cookies are Secure/HttpOnly/SameSite=Lax with a 12-hour server expiry. Logout and global logout delete server sessions. OAuth state is random, cookie-bound, expires after ten minutes and is consumed once.

All private APIs require the fixed owner's session. Writes additionally require an exact Origin and a session-bound CSRF token. Private responses are no-store. Markdown disallows raw HTML and only embeds managed images. There is no arbitrary filesystem editor, terminal, third-party fetch proxy, browser-supplied repository name or arbitrary restore ref.

GitHub App contents permission is repository-wide; API path allowlists reduce exposure but are not a separate GitHub security boundary. Compromise of the Worker or App key can affect the two authorized repositories. GitHub and Cloudflare remain trusted storage/compute providers. An unauthenticated login shell is public and contains no draft data.

For urgent suspension: uninstall the GitHub App from both repositories, revoke its private keys and client secret, and delete the Worker's secrets. This stops new repository access; deleting all D1 sessions signs out existing sessions. Do not delete the public Pages repository to suspend the editor.

Keep dependencies locked and review updates. Do not log request bodies, cookies, callback codes or credentials. Cloudflare observability is disabled in the checked-in configuration. Operational audit rows contain action, object ID and timestamp only.

## Live acceptance and limitations

Required before launch: correct/wrong-account login, expired session and logout; private-media access denied while logged out; phone editing/image upload; two-device stale save; prepare/edit/confirm rejection; publish/withdraw/restore against GitHub Pages; lost-response retry; actual Workers Free CPU/upload limits. Validate existing opening, language switching, chapter links, audio playback and seeking in desktop and phone browsers.

Unit tests use an in-memory SQLite adapter for D1 and a fake Git repository for publishing faults. They do not establish real OAuth, Cloudflare free-tier performance or browser layout correctness. The checked-in Wrangler config intentionally has placeholder IDs; it is not a deployed backend.
