import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, highlights, measure, LIMITS, postInput } from '../src/compose.js';

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

import { pickChannels } from '../src/compose.js';
test('CI picks text channels that are not paused, or exactly the services named', () => {
  const ch = [{ id: 1, service: 'linkedin' }, { id: 2, service: 'instagram' }, { id: 3, service: 'twitter', isQueuePaused: true }, { id: 4, service: 'bluesky' }, { id: 5, service: 'startPage' }];
  assert.deepEqual(pickChannels(ch).map((c) => c.id), [1, 4]);
  assert.deepEqual(pickChannels(ch, ['twitter', 'instagram']).map((c) => c.id), [3]);
});

test('postInput: draft by default, queue and now map to Buffer share modes', () => {
  assert.deepEqual(postInput('c1', 'hi'), { channelId: 'c1', text: 'hi', schedulingType: 'automatic', mode: 'addToQueue', saveToDraft: true });
  assert.deepEqual(postInput('c1', 'hi', 'queue'), { channelId: 'c1', text: 'hi', schedulingType: 'automatic', mode: 'addToQueue' });
  assert.deepEqual(postInput('c1', 'hi', 'now'), { channelId: 'c1', text: 'hi', schedulingType: 'automatic', mode: 'shareNow' });
  assert.equal(postInput('c1', null).text, '');
});

test('repo topics become hashtags when they fit, and are dropped before the limit is crossed', () => {
  const rel = { repoName: 'acme/widget', tag: 'v2.1.0', url: 'https://github.com/acme/widget/releases/tag/v2.1.0',
    body: '- Faster sync\n- Dark mode', topics: ['open-source', 'flutter', 'dev tools', 'x'] };
  const m = compose(rel, 'mastodon');
  assert.match(m, /#OpenSource #Flutter #DevTools$/);
  assert.ok(!/#X\b/.test(m), 'one-letter topics are noise');
  const tiny = compose(rel, 'mastodon', 120);
  assert.ok(measure(tiny, 'mastodon') <= 120);
  assert.equal(compose({ ...rel, topics: [] }, 'mastodon').includes('#'), false);
});

test('a footer (e.g. the contest mention) survives on every network, after the link, and never pushes past the limit', () => {
  const footer = 'Built in public for Buffer Commit 2026.';
  const withFoot = { ...rel, topics: ['dev tools', 'buffer'], footer };
  for (const s of Object.keys(LIMITS)) {
    const t = compose(withFoot, s);
    assert.ok(t.includes(footer), `${s} lost the footer`);
    assert.ok(t.indexOf(footer) > t.indexOf(rel.url), `${s} footer before the link`);
    assert.ok(measure(t, s) <= LIMITS[s], `${s} over the limit`);
  }
  // the footer costs release notes on short networks, never the other way round
  assert.ok(compose(withFoot, 'twitter').length <= LIMITS.twitter);
  assert.equal(compose({ ...rel, footer: '   ' }, 'bluesky'), compose(rel, 'bluesky'));
});

// The three below come from running the live app on real repos on Nov 12 (next.js, react, astro).
test('reference suffixes seen in real release notes are dropped: (#1, #2) and (#1 by @a and @b)', () => {
  const h = highlights('- Pin Tailwind to 4.3.3 in create-next-app and tests (#101061, #101176) (#101307)\n- Improve transport protocol (#37845 by @unstubbable and @eps1lon)\n- Keep (#12) in the middle of a line');
  assert.deepEqual(h, ['Pin Tailwind to 4.3.3 in create-next-app and tests', 'Improve transport protocol', 'Keep (#12) in the middle of a line']);
});

test('changesets "Updated dependencies" and its nested package list are not news', () => {
  const h = highlights('- Fix hydration of slots\n- Updated dependencies []:\n  - @astrojs/vue-renderer@0.1.1\n  - @astrojs/internal@2.0.0\n- Faster dev start');
  assert.deepEqual(h, ['Fix hydration of slots', 'Faster dev start']);
});

test('hashtags prefer the topics that name the project over the first ones in the list', () => {
  const topics = ['blog', 'browser', 'compiler', 'components', 'nextjs', 'node', 'react', 'vercel'];
  const t = compose({ repoName: 'vercel/next.js', tag: 'v16.4.6', url: 'https://github.com/vercel/next.js/releases/tag/v16.4.6', body: '- One fix', description: 'The React Framework', topics }, 'linkedin');
  assert.match(t, /#Nextjs #React #Vercel$/);
  // with nothing to go on, the order GitHub gives stays
  assert.match(compose({ repoName: 'acme/app', tag: 'v1', url: 'https://github.com/acme/app/releases/tag/v1', body: '', topics: ['blog', 'browser'] }, 'linkedin'), /#Blog #Browser$/);
});
