// A pretend shop to run the skill against, served on this Mac only: nothing here is a real site and nobody's analytics see a visit.
//
//   node server.cjs            http://127.0.0.1:9477   (PORT=9500 node server.cjs for another port)
//
// It has what a real page throws at the skill: a cookie banner (promo.json "dismiss"), a floating chat button ("hide"), a card that scrolls
// sideways (the scrollbar the overlay hides), and a link to click. Every request is kept with its user agent: GET /__reqs prints them, which is
// how to see that the "userAgentMarker" in promo.json reaches the site and what a scripted visit costs a real site's counts.
const http = require('node:http');

const PORT = Number(process.env.PORT || 9477);
const log = [];

const rows = [
  ['Lantern', 'Guatemala', 'Cocoa, orange peel', 'Medium', '$14'],
  ['Postmark', 'Ethiopia', 'Jasmine, lemon', 'Light', '$16'],
  ['Night Train', 'Brazil', 'Dark chocolate, toasted nut', 'Dark', '$13'],
  ['Slow Mail', 'Colombia', 'Red apple, brown sugar', 'Medium', '$15'],
];

const page = (title, body, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;background:#f5ede0;color:#2a1e14}
  header{padding:16px;font-weight:800;letter-spacing:.02em;border-bottom:1px solid #e2d4bf}
  main{padding:20px 16px 96px}
  h1{font-size:34px;line-height:1.1;margin:8px 0 12px}
  h2{font-size:20px;margin:0 0 6px}
  .lead{font-size:18px;color:#4a3828}
  .go{display:inline-block;margin:14px 0 26px;padding:13px 20px;border-radius:999px;background:#b4532a;color:#fff;font-weight:700;text-decoration:none}
  .card{background:#fffaf2;border:1px solid #e2d4bf;border-radius:14px;padding:16px;margin:0 0 14px}
  .stats{display:flex;gap:10px;margin:0 0 14px}
  .stats div{flex:1;background:#fffaf2;border:1px solid #e2d4bf;border-radius:14px;padding:12px}
  .stats b{display:block;font-size:26px}
  .scroller{overflow-x:auto;border:1px solid #e2d4bf;border-radius:10px;background:#fffaf2}
  table{border-collapse:collapse;min-width:640px;width:100%}
  th,td{padding:12px;text-align:left;border-bottom:1px solid #eee2cf;white-space:nowrap}
  th{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#7a5f45}
  button.sub{margin-top:16px;padding:14px 22px;border:0;border-radius:999px;background:#2a1e14;color:#fff;font:700 16px/1 inherit;font-family:inherit}
  button.sub[data-on]{background:#2f7d4f}
  .chat{position:fixed;right:14px;bottom:14px;padding:12px 18px;border:0;border-radius:999px;background:#2a1e14;color:#fff;font:600 15px/1 inherit;font-family:inherit;z-index:20}
  #cookies{position:fixed;left:0;right:0;bottom:0;padding:14px 16px;background:#fff;border-top:1px solid #e2d4bf;z-index:30}
  #cookies button{margin:8px 8px 0 0;padding:10px 14px;border-radius:8px;border:1px solid #2a1e14;background:#fff;font:600 15px/1 inherit;font-family:inherit}
</style>${extra}</head><body><header>Postcard Coffee</header>${body}<button class="chat" type="button">Chat</button>
<div id="cookies"><div>We use cookies to remember your box.</div><button id="necessary" type="button">Necessary only</button><button type="button">Accept all</button></div>
<script>
  if (document.cookie.includes('cookies=1')) document.getElementById('cookies').remove();
  document.getElementById('necessary').onclick = () => { document.cookie = 'cookies=1; path=/'; document.getElementById('cookies').remove(); };
  const sub = document.querySelector('button.sub');
  if (sub) sub.onclick = () => { sub.setAttribute('data-on', ''); sub.textContent = 'Added to your box'; };
</script></body></html>`;

const pages = {
  '/': page(
    'Postcard Coffee',
    `<main>
      <h1>Fresh-roasted coffee, posted weekly.</h1>
      <p class="lead">Four small-batch roasts a week, ground to order and in your letterbox by Wednesday.</p>
      <a class="go" href="/roasts">See this week's roasts</a>
      <div class="card"><h2>Roasted on Monday</h2><p>Nothing sits in a warehouse. Every bag carries its roast date.</p></div>
      <div class="card"><h2>Letterbox size</h2><p>The bag is flat, so it fits through the door and nobody has to be home.</p></div>
      <div class="card"><h2>Skip any week</h2><p>Pause, swap a roast or cancel from one page.</p></div>
    </main>`,
  ),
  '/roasts': page(
    "This week's roasts",
    `<main>
      <h1>This week's roasts</h1>
      <div class="stats"><div><b>4</b>roasts</div><div><b>12</b>farms</div><div><b>Mon</b>roast day</div></div>
      <div class="card"><h2>All four</h2>
        <div class="scroller"><table><thead><tr><th>Roast</th><th>Origin</th><th>Tastes like</th><th>Level</th><th>250 g</th></tr></thead><tbody>
          ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
      </div>
      <button class="sub" type="button">Add this week to my box</button>
    </main>`,
  ),
};

http
  .createServer((req, res) => {
    const p = req.url.split('?')[0];
    if (p === '/__reqs') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(log, null, 2));
    }
    if (p === '/favicon.ico') {
      res.statusCode = 204;
      return res.end();
    }
    log.push({ path: p, ua: req.headers['user-agent'] || '' });
    const html = pages[p];
    if (!html) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`demo site on http://127.0.0.1:${PORT}  (requests, with user agents: /__reqs)`));
