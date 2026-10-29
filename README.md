# Release to Social

Ship a GitHub release, get a ready-to-review post for every Buffer channel.

Built for **Buffer Commit 2026** (Oct 28 – Nov 13). Live: https://release-to-social.designmaster.workers.dev

## The problem
Small dev teams ship a release, then someone has to rewrite the changelog five times: 280 characters for X, 300 for Bluesky, 500 for Threads and Mastodon, a longer version for LinkedIn. It is boring, so it gets skipped, and users never hear about the fix they asked for.

## What it does
1. **Connect Buffer** with OAuth 2.0 (Authorization Code + PKCE, private client).
2. **Paste a public repo** (`owner/repo`, or `owner/repo@tag` for a specific release).
3. It reads the release notes from the GitHub API, keeps the real changes (drops "Full Changelog", PR numbers, "by @user in ..." suffixes) and writes **one post per connected channel**, fitted to that network's limit (Buffer counts UTF-16 units; X counts every link as 23).
4. You edit any post in place (live character counter), untick the channels you don't want, and **save them as Buffer drafts**. Nothing is published without you.

Channels that need media (Instagram, TikTok, YouTube, Pinterest) are shown but unticked by default.

## Buffer API calls
- `account { email organizations { id name } }`
- `channels(input: { organizationId })`
- `createPost(input: { channelId, text, schedulingType: automatic, mode: addToQueue, saveToDraft: true })`
- OAuth: `auth.buffer.com/auth`, `auth.buffer.com/token` (code exchange and refresh)

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
