export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Release to Social · ship a GitHub release, post it everywhere with Buffer</title>
<meta name="description" content="Paste a GitHub repo. Get one post per Buffer channel, each written to that network's limit, saved as Buffer drafts for you to review.">
<style>
:root{--ink:#16181d;--muted:#5d6470;--line:#e3e5e9;--bg:#fbfaf7;--card:#fff;--acc:#1f6f5c;--warn:#a5480b}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:980px;margin:0 auto;padding:28px 20px 60px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:nowrap}
h1{font-size:clamp(26px,4vw,38px);line-height:1.15;margin:28px 0 8px;letter-spacing:-.01em}
.lede{color:var(--muted);max-width:640px;margin:0 0 24px}
.brand{font-weight:700;white-space:nowrap}.who{color:var(--muted);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
form{display:flex;gap:8px;flex-wrap:nowrap;margin:0 0 8px}
input[type=text]{flex:1;min-width:0;padding:11px 12px;border:1px solid var(--line);border-radius:8px;font:inherit;background:#fff}
button,.btn{padding:11px 16px;border:0;border-radius:8px;background:var(--acc);color:#fff;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block}
button:disabled{opacity:.5;cursor:default}a{color:var(--acc)}
.hint{font-size:14px;color:var(--muted);margin:0 0 20px}
.rel{border-left:3px solid var(--acc);padding:4px 12px;margin:18px 0;color:var(--muted);font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
.post{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;transition:border-color .2s}
.post.off{opacity:.55}.post:focus-within{border-color:var(--acc)}
.post h3{margin:0;font-size:15px;display:flex;align-items:center;gap:8px}.post h3 img{width:22px;height:22px;border-radius:50%}
.post label{display:flex;gap:6px;align-items:center;font-size:14px;color:var(--muted);margin-left:auto}
textarea{width:100%;min-height:150px;resize:vertical;border:1px solid var(--line);border-radius:6px;padding:8px;font:14px/1.45 ui-monospace,Menlo,monospace}
.count{font-size:12px;color:var(--muted);text-align:right}.count.over{color:var(--warn);font-weight:700}
.bar{position:sticky;bottom:0;background:var(--bg);padding:14px 0;display:flex;gap:12px;align-items:center;justify-content:space-between;border-top:1px solid var(--line);margin-top:18px}
.bar[hidden]{display:none}.msg{font-size:14px}.ok{color:var(--acc)}.err{color:var(--warn)}
footer{margin-top:40px;font-size:13px;color:var(--muted)}
.auto{margin-top:34px;border-top:1px solid var(--line);padding-top:18px}.auto summary{cursor:pointer;font-weight:600}.auto ol{padding-left:20px;color:var(--muted)}.auto pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font-size:13px;line-height:1.45}
@media (prefers-reduced-motion:no-preference){.post{animation:in .35s ease-out both}@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
@media (max-width:420px){button,.btn{padding:10px 12px}main{padding:18px 14px 50px}}
</style></head><body><main>
<header><span class="brand">Release to Social</span><span class="who" id="who"></span></header>
<h1>Ship the release. The posts write themselves.</h1>
<p class="lede">Paste a public GitHub repo. Release to Social reads the latest release notes and writes one post per Buffer channel, each fitted to that network's limit. Nothing goes out on its own: the posts land in Buffer as drafts for you to review.</p>
<div id="connect"></div>
<form id="f"><input type="text" id="repo" placeholder="owner/repo, e.g. cli/cli" value="cli/cli" aria-label="GitHub repository"><button id="go">Write posts</button></form>
<p class="hint">Optional: add <code>@tag</code> for a specific release, e.g. <code>cli/cli@v2.60.0</code>.</p>
<div id="rel"></div><div class="grid" id="grid"></div>
<div class="bar" id="bar" hidden><span class="msg" id="msg"></span><button id="save">Save as Buffer drafts</button></div>
<details class="auto"><summary>Automate it: drafts on every release, without opening this page</summary>
<ol>
<li>In Buffer, go to Settings, API, New Key (account:read, posts:read, posts:write) and copy the key.</li>
<li>In your GitHub repo, add it as the secret <code>BUFFER_API_KEY</code>.</li>
<li>Add this workflow. Publish a release, open Buffer, review the drafts.</li>
</ol>
<pre># .github/workflows/release-to-social.yml
name: Social posts for a release
on:
  release:
    types: [published]
jobs:
  social:
    uses: DesignMaster-Solutions/release-to-social/.github/workflows/drafts.yml@main
    secrets:
      BUFFER_API_KEY: \${{ secrets.BUFFER_API_KEY }}</pre>
<p class="hint">The key only passes through: it is sent with each request to <code>POST /api/ci</code> and never stored. Media-only channels and paused queues are skipped.</p>
</details>
<footer>Built for Buffer Commit 2026 by <a href="https://www.designmastersolutions.com/?utm_source=release-to-social&utm_medium=referral&utm_campaign=site-footer">Design Master Solutions</a>. Open source: <a href="https://github.com/DesignMaster-Solutions/release-to-social">GitHub</a>. Your Buffer tokens live only in an encrypted cookie in your browser.</footer>
</main><script>
const $=s=>document.querySelector(s);let me=null,data=null;
const NAMES={twitter:'X',bluesky:'Bluesky',threads:'Threads',mastodon:'Mastodon',linkedin:'LinkedIn',facebook:'Facebook',instagram:'Instagram',googlebusiness:'Google Business',pinterest:'Pinterest',tiktok:'TikTok',youtube:'YouTube'};
const measure=(t,s)=>s==='twitter'?t.replace(/https?:\\/\\/\\S+/g,'x'.repeat(23)).length:t.length;
async function boot(){
  const r=await fetch('/api/me');
  if(r.ok){me=await r.json();$('#who').innerHTML=(me.email||'')+' · <a href="/logout">Disconnect</a>';
    if(!me.channels.length)$('#connect').innerHTML='<p class="rel">Your Buffer account has no channels yet. Connect one in Buffer, then reload.</p>';}
  else $('#connect').innerHTML='<p><a class="btn" href="/login">Connect Buffer</a> <span class="hint">or try it below without connecting.</span></p>';
}
function card(key,title,avatar,p,on){
  const el=document.createElement('div');el.className='post'+(on?'':' off');
  el.innerHTML='<h3>'+(avatar?'<img alt="" src="'+avatar+'">':'')+'<span></span><label><input type="checkbox"'+(on?' checked':'')+'> include</label></h3><textarea></textarea><div class="count"></div>';
  el.querySelector('span').textContent=title;const ta=el.querySelector('textarea'),cb=el.querySelector('input'),ct=el.querySelector('.count');
  ta.value=p.text;const upd=()=>{const n=measure(ta.value,p.service);ct.textContent=n+' / '+p.limit+(p.needsMedia?' · needs an image or video in Buffer':'');ct.className='count'+(n>p.limit?' over':'');};
  ta.oninput=upd;cb.onchange=()=>el.classList.toggle('off',!cb.checked);upd();el.dataset.key=key;el._get=()=>({on:cb.checked,text:ta.value});return el;
}
$('#f').onsubmit=async e=>{e.preventDefault();const [repo,tag]=$('#repo').value.trim().split('@');$('#go').disabled=true;$('#grid').innerHTML='';$('#rel').innerHTML='';
  try{const services=me?[...new Set(me.channels.map(c=>c.service))]:[];
    const q='?repo='+encodeURIComponent(repo)+(tag?'&tag='+encodeURIComponent(tag):'')+(me?'&services='+services.join(','):'');
    const r=await fetch((me&&me.channels.length?'/api/preview':'/api/demo-release')+q);const j=await r.json();if(!r.ok)throw new Error(j.error);data=j;
    const rel=j.release;$('#rel').innerHTML='<div class="rel" id="relinfo"></div>';$('#relinfo').textContent=rel.repoName+' '+rel.tag+' · published '+new Date(rel.publishedAt).toLocaleDateString();
    if(me&&me.channels.length){for(const c of me.channels){const p={...j.posts[c.service],service:c.service};$('#grid').append(card(c.id,(c.displayName||c.name)+' · '+(NAMES[c.service]||c.service),c.avatar,p,!p.needsMedia&&!c.isQueuePaused));}
      $('#bar').hidden=false;$('#msg').textContent='';}
    else{for(const [s,p] of Object.entries(j.posts))$('#grid').append(card(s,NAMES[s],null,{...p,service:s},true));
      $('#bar').hidden=false;$('#save').textContent=me?'Add a channel in Buffer to save':'Connect Buffer to save';$('#save').onclick=()=>location.href=me?'https://publish.buffer.com/channels/connect':'/login';}
  }catch(err){$('#rel').innerHTML='<p class="msg err"></p>';$('#rel p').textContent=err.message;}finally{$('#go').disabled=false;}
};
$('#save').onclick=async()=>{const posts=[...document.querySelectorAll('.post')].map(el=>({channelId:el.dataset.key,...el._get()})).filter(p=>p.on).map(({channelId,text})=>({channelId,text}));
  if(!posts.length)return;$('#save').disabled=true;$('#msg').textContent='Saving '+posts.length+' drafts…';
  try{const r=await fetch('/api/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({posts})});const j=await r.json();if(!r.ok)throw new Error(j.error);
    const ok=j.results.filter(x=>x.ok).length,bad=j.results.filter(x=>!x.ok);
    $('#msg').className='msg '+(bad.length?'err':'ok');$('#msg').innerHTML=ok+(ok===1?' draft':' drafts')+' saved in Buffer. <a href="https://publish.buffer.com/drafts" target="_blank" rel="noopener">Review them</a>'+(bad.length?' · '+bad.length+' failed: '+bad.map(b=>b.error).join('; '):'');
  }catch(err){$('#msg').className='msg err';$('#msg').textContent=err.message;}finally{$('#save').disabled=false;}
};
boot();
</script></body></html>`;

export const PRIVACY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy · Release to Social</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#16181d}</style></head><body>
<h1>Privacy</h1>
<p>Release to Social is an open-source tool by Design Master Solutions LLC that turns a public GitHub release into draft posts in your Buffer account.</p>
<ul>
<li><b>What we store:</b> nothing on our servers. After you connect Buffer, your access and refresh tokens are kept in an encrypted, HttpOnly cookie in your own browser. Disconnect deletes it.</li>
<li><b>What we access:</b> your Buffer account email, organizations and channels (to list where to post), and the ability to create posts. Posts are saved as drafts; nothing is published without you.</li>
<li><b>GitHub:</b> we read only public repository and release data from the GitHub API.</li>
<li><b>No tracking:</b> no analytics, no ads, no third-party scripts.</li>
</ul>
<p>Revoke access at any time in Buffer under Settings, Apps. Contact: info@designmastersolutions.com</p>
<p><a href="/">Back</a></p></body></html>`;
