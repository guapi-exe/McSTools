// Fresh document + worker, with already loaded route modules. Browser fixture only.
async (page) => {
  await page.evaluate(async () => {
    const tools = await import('/src/modules/tools_data.ts');
    tools.clear_tools();
    await tools.fetch_data(42);
  });
  await page.getByRole('tab', {name: '蓝图详情', exact: true}).waitFor();
  await page.evaluate(() => {
    window.__sourceStartedAt = performance.now();
    window.__sourceFirstFrames = new Promise(resolve => {
      const start = performance.now(), frames = [];
      let last = start;
      const tick = time => {
        if (time >= last) frames.push(time - last);
        last = time;
        if (time - start < 1500) requestAnimationFrame(tick);
        else resolve({maxFrameMs: Math.max(...frames), framesOver50Ms: frames.filter(ms => ms > 50).length});
      };
      requestAnimationFrame(tick);
    });
  });
  await page.getByRole('tab', {name: '源数据查看', exact: true}).click();
  await page.getByRole('button', {name: '展开 Schematic', exact: true}).waitFor();
  const readyMs = await page.evaluate(() => performance.now() - window.__sourceStartedAt);
  const timing = await page.evaluate(() => window.__sourceFirstFrames);
  const initialRows = await page.locator('.source-row').count();
  await page.getByRole('button', {name: '展开 Schematic', exact: true}).click();
  await page.getByRole('button', {name: '展开 Blocks', exact: true}).click();
  await page.getByRole('button', {name: '展开 Data', exact: true}).click();
  await page.getByRole('button', {name: '编辑 0', exact: true}).waitFor();
  const expandedRows = await page.locator('.source-row').count();
  // The virtual scroller must show a subsequent page without expanding all.
  await page.getByRole('tree', {name: 'NBT 字段'}).evaluate(el => {el.scrollTop = el.scrollHeight});
  await page.getByRole('button', {name: '加载后续项（100 / 413280）', exact: true}).click();
  const paginatedRows = await page.locator('.source-row').count();
  await page.getByRole('tree', {name: 'NBT 字段'}).evaluate(el => {el.scrollTop = 0});
  return {readyMs, ...timing, initialRows, expandedRows, paginatedRows, totalArrayItems: 413280};
}
