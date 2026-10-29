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
  for (const raw of body.split(/\r?\n/)) {
    const l = raw.trim();
    const m = l.match(/^[-*+]\s+(.*)$/) || l.match(/^\d+[.)]\s+(.*)$/);
    if (!m) continue;
    const t = m[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')    // [text](url) -> text
      .replace(/[`*_~]/g, '')
      .replace(/\s+by\s+@[\w-]+\s+in\s+\S+$/i, '') // GitHub auto-notes suffix
      .replace(/\s*\(#\d+\)$/, '')
      .trim();
    if (t && !/^full changelog/i.test(t)) lines.push(t);
  }
  return lines;
}

function cut(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, '') + '…';
}

// Build the post for one service, never over its limit.
export function compose(release, service, maxChars) {
  const limit = (maxChars || LIMITS[service] || 500);
  const name = release.repoName;
  const version = release.tag || release.name || '';
  const head = `${name} ${version} is out`.trim();
  const url = release.url;
  const items = highlights(release.body);
  const long = limit >= 1500;
  const bullet = long ? '• ' : '- ';
  const maxItems = long ? 8 : 3;

  const build = (n, itemLen) => {
    const picked = items.slice(0, n).map((t) => bullet + cut(t, itemLen));
    const parts = [head + (long ? '.' : ':')];
    if (long && release.description) parts.push(release.description);
    if (picked.length) parts.push(picked.join('\n'));
    if (items.length > n && long) parts.push(`+ ${items.length - n} more changes`);
    parts.push(url);
    return parts.join('\n\n');
  };

  for (let n = Math.min(maxItems, items.length); n >= 0; n--) {
    for (const itemLen of [long ? 200 : 90, 60, 40]) {
      const text = build(n, itemLen);
      if (measure(text, service) <= limit) return text;
    }
  }
  return cut(`${head} ${url}`, limit);
}
