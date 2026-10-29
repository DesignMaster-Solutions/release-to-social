import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, highlights, measure, LIMITS } from '../src/compose.js';

const body = `## What's Changed
* Add dark mode to the dashboard by @ana in https://github.com/o/r/pull/12
* Fix [login loop](https://github.com/o/r/issues/9) on Safari (#13)
- Faster CSV export, about 4x on 50k rows
- ${'Very long change description '.repeat(20)}
1. Drop Node 18 support

**Full Changelog**: https://github.com/o/r/compare/v1.1.0...v1.2.0`;

const rel = { repoName: 'acme/app', tag: 'v1.2.0', url: 'https://github.com/acme/app/releases/tag/v1.2.0', body, description: 'Invoices for small shops.' };

test('highlights strips markdown and auto-note suffixes', () => {
  const h = highlights(body);
  assert.equal(h[0], 'Add dark mode to the dashboard');
  assert.equal(h[1], 'Fix login loop on Safari');
  assert.equal(h.length, 5);
});

test('every service stays within its limit', () => {
  for (const s of Object.keys(LIMITS)) {
    const t = compose(rel, s);
    const n = s === 'twitter' ? t.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length : t.length;
    assert.ok(n <= LIMITS[s], `${s}: ${n} > ${LIMITS[s]}`);
    assert.ok(t.includes(rel.url), `${s} keeps the link`);
  }
});

test('X counts the link as 23 chars', () => {
  assert.equal(measure('a https://example.com/' + 'x'.repeat(200), 'twitter'), 25);
});

test('long networks carry more than short ones', () => {
  assert.ok(compose(rel, 'linkedin').length > compose(rel, 'bluesky').length);
  assert.match(compose(rel, 'linkedin'), /Invoices for small shops/);
});

test('mastodon honours the server limit', () => {
  assert.ok(compose(rel, 'mastodon', 120).length <= 120);
});

import { fromAtom } from '../src/compose.js';
test('atom fallback keeps the changes and the tag', () => {
  const xml = `<feed><entry><updated>2026-10-26T19:24:06Z</updated>
<link rel="alternate" type="text/html" href="https://github.com/cli/cli/releases/tag/v2.103.3"/><title>GitHub CLI 2.103.3</title>
<content type="html">&lt;ul&gt;&lt;li&gt;fix(gh auth status): explain tokens with &lt;code&gt;--no-refresh&lt;/code&gt; by &lt;a href=&quot;x&quot;&gt;@babakks&lt;/a&gt; in &lt;a href=&quot;y&quot;&gt;#14815&lt;/a&gt;&lt;/li&gt;&lt;/ul&gt;</content></entry>
<entry><link href="https://github.com/cli/cli/releases/tag/v2.103.2"/><content>&lt;ul&gt;&lt;li&gt;older&lt;/li&gt;&lt;/ul&gt;</content></entry></feed>`;
  const r = fromAtom(xml, 'cli/cli');
  assert.equal(r.tag, 'v2.103.3');
  assert.deepEqual(highlights(r.body), ['fix(gh auth status): explain tokens with --no-refresh']);
  assert.equal(fromAtom(xml, 'cli/cli', 'v2.103.2').body, '- older');
  assert.throws(() => fromAtom(xml, 'cli/cli', 'v9'));
});
