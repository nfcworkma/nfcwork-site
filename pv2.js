const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name,cs] of [['livreur','light'],['suivi','light']]){
    const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, colorScheme:cs });
    await p.goto('file:///home/claude/preview-'+name+'.html', { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    await p.screenshot({ path: 'pv-'+name+'.png', fullPage: true });
  }
  await b.close(); console.log('ok');
})();
