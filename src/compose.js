// Pure helpers: turn a GitHub release into one post per Buffer channel.
// Buffer validates text length in UTF-16 code units (string.length); X counts every URL as 23.

export const LIMITS = {
  twitter: 280, bluesky: 300, threads: 500, mastodon: 500, linkedin: 3000,
  facebook: 5000, googlebusiness: 1500, instagram: 2196, pinterest: 500, tiktok: 2200, youtube: 5000,
};

// Services that cannot take a text-only post through createPost.
export const NEEDS_MEDIA = new Set(['instagram', 'tiktok', 'youtube', 'pinterest']);

const URL_RE = /https?:\/\/\S+/g;

export function measure(text, service) {
  if (service === 'twitter') return text.replace(URL_RE, 'x'.repeat(23)).length;
  return text.length;
}

// Release body (markdown) -> plain bullet lines, most important first.
export function highlights(body = '') {
  const lines = [];
  let skipNested = false; // the package list under a dropped "Updated dependencies" goes with it
  for (const raw of body.split(/\r?\n/)) {
    const l = raw.trim();
    const m = l.match(/^[-*+]\s+(.*)$/) || l.match(/^\d+[.)]\s+(.*)$/);
    if (!m) continue;
    if (/^\s/.test(raw) && skipNested) continue;
    skipNested = /^updated dependencies/i.test(m[1]);
    if (skipNested) continue;
    const t = m[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')    // [text](url) -> text
      .replace(/[`*_~]/g, '')
      .replace(/\s+by\s+@[\w-]+\s+in\s+\S+$/i, '') // GitHub auto-notes suffix
      .replace(/(?:\s*\(#\d+(?:,\s*#\d+)*(?:\s+by\s+@[\w-]+(?:(?:,|\s+and)\s+@[\w-]+)*)?\))+$/, '') // (#1), (#1, #2) (#3), (#1 by @a and @b)
      .trim();
    if (t && !/^full changelog/i.test(t)) lines.push(t);
  }
  return lines;
}

// a leading @ would tag an unrelated account (scoped package, GitHub handle); pkg@1.2.3 and /@scope in a URL are not mentions
const plain = (s) => String(s || '').replace(/(^|[^\w/])@(?=\w)/g, '$1');

function cut(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, '') + '…';
}

// Repo topics as hashtags ("dev tools" -> #DevTools); one-letter topics are noise. At most three.
// Topics that name the project (found in the repo name or description) go first: next.js is #Nextjs #React, not #Blog #Browser.
export const hashtags = (topics = [], hint = '') => {
  const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = new Set(String(hint).split(/[\s/]+/).map(norm));
  const named = (t) => words.has(norm(t));
  return [...topics.filter(named), ...topics.filter((t) => !named(t))]
    .map((t) => String(t).split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(''))
    .filter((t) => t.length > 1).slice(0, 3).map((t) => '#' + t);
};

// Build the post for one service, never over its limit.
export function compose(release, service, maxChars) {
  const limit = (maxChars || LIMITS[service] || 500);
  const name = release.repoName;
  const version = release.tag || release.name || '';
  const head = plain(`${name} ${version} is out`.trim());
  const url = release.url;
  const items = highlights(release.body).map(plain);
  const about = plain(release.description);
  const tags = hashtags(release.topics, `${release.repoName} ${release.description || ''}`);
  // a fixed line the caller needs on every post (contest mention, disclosure): it costs release notes, never the reverse
  const foot = String(release.footer || '').trim();
  const long = limit >= 1500;
  const bullet = long ? '• ' : '- ';
  const maxItems = long ? 8 : 3;

  // short networks say what the project is only when the release has no change to list (a dependency bump)
  const say = about && (long || !items.length);
  const build = (n, itemLen, nTags, desc) => {
    const picked = items.slice(0, n).map((t) => bullet + cut(t, itemLen));
    const parts = [head + (long || !picked.length ? '.' : ':')]; // a colon only with something after it
    if (desc) parts.push(about);
    if (picked.length) parts.push(picked.join('\n'));
    if (items.length > n && long) parts.push(`+ ${items.length - n} more changes`);
    parts.push(url);
    if (foot) parts.push(foot);
    if (nTags) parts.push(tags.slice(0, nTags).join(' '));
    return parts.join('\n\n');
  };

  // the changes come first: hashtags only take room the release notes did not need
  for (const desc of say ? [true, false] : [false]) {
    for (let n = Math.min(maxItems, items.length); n >= 0; n--) {
      for (const itemLen of [long ? 200 : 90, 60, 40]) {
        for (let k = tags.length; k >= 0; k--) {
          const text = build(n, itemLen, k, desc);
          if (measure(text, service) <= limit) return text;
        }
      }
    }
  }
  const bare = foot ? `${head} ${url}\n\n${foot}` : '';
  return bare && measure(bare, service) <= limit ? bare : cut(`${head} ${url}`, limit);
}

// createPost input for one channel. 'draft' (default) saves for review, 'queue' takes the channel's next slot,
// 'now' publishes at once (CI opt-in; the page itself only ever saves drafts).
export function postInput(channelId, text, mode = 'draft') {
  const input = { channelId, text: String(text || ''), schedulingType: 'automatic', mode: mode === 'now' ? 'shareNow' : 'addToQueue' };
  if (mode === 'draft') input.saveToDraft = true;
  return input;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Fallback when the GitHub REST API rate-limits shared egress IPs: the public releases.atom feed.
export function fromAtom(xml, repo, tag) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const pick = entries.find((e) => !tag || e.includes(`/releases/tag/${tag}"`)) ;
  if (!pick) throw new Error(tag ? `Release ${tag} not found in ${repo}` : `${repo} has no releases`);
  const url = (pick.match(/<link[^>]*href="([^"]+)"/) || [])[1];
  const html = decode((pick.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || '');
  const body = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((m) => '- ' + decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).join('\n');
  return {
    repoName: repo, description: '', tag: decodeURIComponent(url.split('/releases/tag/')[1] || ''),
    name: decode((pick.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''), url, body,
    publishedAt: (pick.match(/<updated>([^<]+)/) || [])[1],
  };
}

// CI has nobody to untick a card: only networks the composer knows (a Start Page is not one), no media-only
// networks, and no paused queues unless the caller names the services.
export const postable = (channels) => channels.filter((c) => c.service in LIMITS);
export function pickChannels(channels, services) {
  const want = (services || []).filter(Boolean);
  return postable(channels).filter((c) => !NEEDS_MEDIA.has(c.service) && (want.length ? want.includes(c.service) : !c.isQueuePaused));
}
