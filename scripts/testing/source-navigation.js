// Pass to playwright-cli run-code after opening the source fixture page.
async (page) => {
  await page.evaluate(async () => {
    const theme = await import('/src/modules/theme.ts');
    const {vuetify} = await import('/src/plugins/vuetify.ts');
    theme.backgroundUrl.value = '/src/static/img/bg.jpg';
    theme.opacity.value = .84;
    vuetify.theme.global.name.value = 'grey_dark';
  });
  const loadsBefore = await page.evaluate(() => window.__SOURCE_CONNECTION_FIXTURE__.loads);
  const results = [];
  for (const name of ['问题反馈', '关于', '蓝图库', '蓝图工具']) {
    await page.getByLabel(name, {exact: true}).hover();
    await page.evaluate(() => {
      window.__navigationSample = new Promise(resolve => {
        const start = performance.now(), frames = [], opacities = [], transforms = [];
        let last = start, blankFrames = 0;
        const tick = time => {
          if (time >= last) frames.push(time - last);
          last = time;
          const view = document.querySelector('main .page-view');
          if (!view) blankFrames++;
          else {
            const style = getComputedStyle(view);
            opacities.push(Number(style.opacity));
            if (style.transform !== 'none') transforms.push(style.transform);
            if (Number(style.opacity) < .1) blankFrames++;
          }
          if (time - start < 900) requestAnimationFrame(tick);
          else resolve({maxFrameMs: Math.max(...frames), blankFrames, minOpacity: Math.min(...opacities), movingFrames: transforms.length});
        };
        requestAnimationFrame(tick);
      });
    });
    await page.getByLabel(name, {exact: true}).click();
    const sample = await page.evaluate(() => window.__navigationSample);
    const layout = await page.evaluate(() => {
      const drawer = document.querySelector('.fixed-sidebar').getBoundingClientRect();
      const card = document.querySelector('.full-screen-card')?.getBoundingClientRect();
      return {drawerRight: drawer.right, fixedCardLeft: card?.left};
    });
    results.push({name, ...sample, ...layout});
  }
  await page.getByRole('button', {name: '编辑 Width', exact: true}).waitFor();
  const loadsAfter = await page.evaluate(() => window.__SOURCE_CONNECTION_FIXTURE__.loads);
  return {results, loadsBefore, loadsAfter, sourceStatePreserved: await page.getByTitle('83s', {exact: true}).isVisible()};
}
