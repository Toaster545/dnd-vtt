const { chromium } = require('playwright');

const URL =
  'http://localhost:4200/home/campaigns/manage/94f217dc-effc-4293-8a00-a9c52c72b82e/wiki/test';

(async () => {
  const b = await chromium.launch({ executablePath: '/home/mathieu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 640 } });
  p.on('console', (m) => console.log('  [console]', m.type(), m.text()));

  await p.goto('http://localhost:4200', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.setItem('token', 'dev');
    localStorage.setItem('auth_token', 'dev');
    localStorage.setItem('accessToken', 'dev');
    localStorage.setItem('jwt', 'dev');
  });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);

  const info = await p.evaluate(() => {
    let el = document.querySelector('.cm-scroller');
    if (!el)
      return {
        error: 'no .cm-scroller',
        bodyText: document.body.innerText.slice(0, 400),
        url: location.href,
      };
    const rows = [];
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      rows.push({
        tag:
          el.tagName.toLowerCase() +
          (el.className
            ? '.' + String(el.className).trim().replace(/\s+/g, '.').slice(0, 70)
            : ''),
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
        overflowY: cs.overflowY,
        display: cs.display,
        flexGrow: cs.flexGrow,
        minH: cs.minHeight,
        height: cs.height,
      });
      el = el.parentElement;
    }
    return {
      rows,
      docScrollH: document.documentElement.scrollHeight,
      docClientH: document.documentElement.clientHeight,
      url: location.href,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await b.close();
})();
