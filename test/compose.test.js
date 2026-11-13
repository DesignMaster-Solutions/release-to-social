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

import { pickChannels, postable } from '../src/compose.js';
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

// Found on the live page on Nov 12 with withastro/astro: @astrojs/vue@7.1.5 only bumps dependencies.
test('a release with nothing to list ends its headline with a full stop and says what the project is', () => {
  const rel = { repoName: 'withastro/astro', tag: '@astrojs/vue@7.1.5', url: 'https://github.com/withastro/astro/releases/tag/%40astrojs/vue%407.1.5', body: '### Patch Changes\n\n- Updated dependencies []:\n  - @astrojs/vue-renderer@0.1.1', description: 'The web framework for content-driven websites.', topics: ['astro'] };
  for (const s of Object.keys(LIMITS)) {
    const t = compose(rel, s);
    assert.ok(!/is out:/.test(t), `${s} headline ends in a colon with nothing after it`);
    assert.ok(t.includes(rel.description), `${s} lost the description`);
    assert.ok(measure(t, s) <= LIMITS[s], `${s} over the limit`);
  }
  // a description too long for a short network is dropped, the colon still does not dangle
  const x = compose({ ...rel, description: 'word '.repeat(80) }, 'twitter');
  assert.ok(!/is out:/.test(x) && measure(x, 'twitter') <= LIMITS.twitter);
  // with changes to list, short networks keep the colon and skip the description
  assert.match(compose({ ...rel, body: '- Fix slots' }, 'bluesky'), /is out:\n\n- Fix slots/);
});

// A scoped package (@astrojs/vue) or a contributor handle in the notes would tag an unrelated account on X, Mastodon, Bluesky.
test('a scoped package or a GitHub handle never becomes a mention, the footer and the link are left alone', () => {
  const rel = { repoName: 'withastro/astro', tag: '@astrojs/vue@7.1.5', url: 'https://github.com/withastro/astro/releases/tag/@astrojs/vue@7.1.5', body: '- Fix slots in @astrojs/vue, thanks @alice\n- (@bob) typo', description: 'By @withastro.', topics: ['astro'], footer: 'Drafted with @buffer.' };
  for (const s of Object.keys(LIMITS)) {
    const t = compose(rel, s);
    const rest = t.replace(rel.url, '').replace(rel.footer, '');
    assert.ok(!/(^|[^\w/])@\w/.test(rest), `${s} would mention someone: ${rest}`);
    assert.ok(t.includes(rel.url) && t.includes(rel.footer), `${s} lost the link or the footer`);
    assert.ok(t.includes('astrojs/vue@7.1.5 is out'), `${s} lost the version`);
  }
});

test('the web page lists only channels Buffer lets an app post to (a Start Page is not one)', () => {
  const channels = [{ id: 'a', service: 'linkedin' }, { id: 'b', service: 'startPage' }, { id: 'c', service: 'instagram' }];
  assert.deepEqual(postable(channels).map((c) => c.id), ['a', 'c']);
});

test('real notes (vite, bun, tailwind, svelte): commit hashes, contributor lists, snake_case names and a tag that repeats the repo', () => {
  const notes = `### Bug Fixes
* **build:** keep magicString in transform hook meta ([#24012](https://github.com/vitejs/vite/issues/24012)) ([a3b28e8](https://github.com/vitejs/vite/commit/a3b28e8))
- Ensure it loads with \`NAPI_RS_FORCE_WASI=error\` and _really_ fast

### Thanks to 2 contributors!
- [@0xh3x](https://github.com/0xh3x)
- @alii`;
  assert.deepEqual(highlights(notes), [
    'build: keep magicString in transform hook meta',
    'Ensure it loads with NAPI_RS_FORCE_WASI=error and really fast',
  ]);
  const rel = (repoName, tag) => ({ repoName, tag, url: 'https://github.com/o/r', body: '' });
  assert.ok(compose(rel('sveltejs/svelte', 'svelte@5.57.3'), 'twitter').startsWith('sveltejs/svelte 5.57.3 is out'));
  assert.ok(compose(rel('oven-sh/bun', 'bun-v1.4.4'), 'twitter').startsWith('oven-sh/bun v1.4.4 is out'));
  // another package of a monorepo keeps its name
  assert.ok(compose(rel('withastro/astro', '@astrojs/vue@7.1.5'), 'twitter').startsWith('withastro/astro astrojs/vue@7.1.5 is out'));
});
