# Release to Social

Ship a GitHub release, get a ready-to-review post for every Buffer channel.

Built for **Buffer Commit 2026** (Oct 28 – Nov 13). Live: https://release-to-social.designmaster.workers.dev

## Built during Buffer Commit
All of it was written in the build window (first commit Oct 29). By release:
- **v0.1.0** (Oct 29): the web app. Buffer OAuth 2.0 with PKCE, one post per connected channel fitted to that network's limit, edit in place, save as Buffer drafts.
- **v0.2.0** (Oct 30): `/api/ci` and a reusable GitHub workflow. Every published release becomes Buffer drafts, no browser.
- **v0.3.0** (Oct 31): `mode`: `draft` (default), `queue` for the next slot, or `now` through Buffer's shareNow.
- **v0.4.0** (Nov 3): repo topics become hashtags in the room the notes leave, and a `footer` line kept on every post and never cut.

This repo runs its own workflow (`.github/workflows/release-to-social.yml`), and our build-in-public posts on LinkedIn went out through `/api/ci` with `mode: now`.

## Demo video
Walkthrough (1:56): https://vimeo.com/1240743529 (also in `docs/demo.mp4`).

## The problem
Small dev teams ship a release, then someone has to rewrite the changelog five times: 280 characters for X, 300 for Bluesky, 500 for Threads and Mastodon, a longer version for LinkedIn. It is boring, so it gets skipped, and users never hear about the fix they asked for.

## What it does
1. **Connect Buffer** with OAuth 2.0 (Authorization Code + PKCE, private client).
2. **Paste a public repo** (`owner/repo`, or `owner/repo@tag` for a specific release).
3. It reads the release notes from the GitHub API, keeps the real changes (drops "Full Changelog", PR numbers, "by @user in ..." suffixes) and writes **one post per connected channel**, fitted to that network's limit (Buffer counts UTF-16 units; X counts every link as 23).
4. You edit any post in place (live character counter), untick the channels you don't want, and **save them as Buffer drafts**. Nothing is published without you.

Channels that need media (Instagram, TikTok, YouTube, Pinterest) are shown but unticked by default.

## Automate it (GitHub Action)
Every published release becomes Buffer drafts, no browser needed. This repo runs it on itself (`.github/workflows/release-to-social.yml`).
1. Buffer → Settings → API → **New Key** (account:read, posts:read, posts:write).
2. Add it to your repo as the secret `BUFFER_API_KEY`.
3. Add the workflow:
```yaml
name: Social posts for a release
on:
  release:
    types: [published]
jobs:
  social:
    uses: DesignMaster-Solutions/release-to-social/.github/workflows/drafts.yml@main
    secrets:
      BUFFER_API_KEY: ${{ secrets.BUFFER_API_KEY }}
```
Or call the endpoint from anything that can run curl:
```bash
curl -X POST https://release-to-social.designmaster.workers.dev/api/ci \
  -H "Authorization: Bearer $BUFFER_API_KEY" -H 'Content-Type: application/json' \
  -d '{"repo":"owner/repo","tag":"v1.2.0"}'        # tag optional: latest release
```
The key is used for that request only and never stored. Media-only channels (Instagram, TikTok, YouTube, Pinterest) and paused queues are skipped; pass `"services":["linkedin","bluesky"]` to choose.

Repo topics become up to three hashtags (`dev-tools` → `#DevTools`), only in the room the release notes leave.

`mode` picks what happens in Buffer: `draft` (default) saves the posts for review, `queue` adds them to each channel's next slot, `now` publishes them at once. In the workflow: `with: { mode: now }`; in curl: `"mode":"now"`. The web page only ever saves drafts.

`footer` is one line kept on every post and never cut, after the link (a contest mention, a disclosure, a sign-off; up to 200 characters). On short networks it costs release notes, never the other way round. This repo's own workflow uses it so each release post says it is part of Buffer Commit: `with: { footer: "Built in public for Buffer Commit 2026." }`; in curl: `"footer":"..."`.

## Buffer API calls
- `account { email organizations { id name } }`
- `channels(input: { organizationId })`
- `createPost(input: { channelId, text, schedulingType: automatic, mode: addToQueue | shareNow, saveToDraft })`
- OAuth: `auth.buffer.com/auth`, `auth.buffer.com/token` (code exchange and refresh); personal API key as Bearer for `/api/ci`

## Run it
```bash
npm test                      # composer tests (node --test)
wrangler secret put BUFFER_CLIENT_ID
wrangler secret put BUFFER_CLIENT_SECRET
wrangler secret put SESSION_KEY  # any long random string
wrangler deploy
```
Register an app client in Buffer (Settings → API → App Clients) with scopes `account:read posts:read posts:write` and redirect `https://<your-worker>/callback`.

## Privacy
No database. Tokens live in an AES-GCM encrypted, HttpOnly cookie in your browser. See `/privacy`.

## License
MIT · Design Master Solutions LLC
