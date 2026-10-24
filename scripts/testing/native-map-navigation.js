// Pass this browser function to Playwright CLI eval on the real isolated Tauri
// Map Art tab. First select all 320 blocks and enable relief through the UI.
// Uses a generated image, the real File input / worker / route handlers and IPC.
// Worker instrumentation observes lifetime; it does not replace computation.
async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  if (await invoke('plugin:app|identifier') !== 'mcSchematic.native-integration-20261018') throw new Error('Not the isolated test profile');
  if (location.pathname !== '/others' || document.hidden) throw new Error('Run on the visible Map Art tab');
  const input = document.querySelector('.map-editor-row input[type="file"]');
  if (!input) throw new Error('Map Art file input not present');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d'), pixels = context.createImageData(1024, 1024);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = (i / 4) % 256; pixels.data[i+1] = (i / 4096) % 256;
    pixels.data[i+2] = ((i / 4) * 7) % 256; pixels.data[i+3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  canvas.width = canvas.height = 0;
  const OriginalWorker = window.Worker, workers = [];
  window.Worker = class extends OriginalWorker {
    constructor(...args) { super(...args); this.sample = {started: performance.now(), ended: null}; workers.push(this.sample); }
    terminate() { this.sample.ended ??= performance.now(); super.terminate(); }
  };
  try {
    const files = new DataTransfer(); files.items.add(new File([blob], 'native-navigation-1024.png', {type: 'image/png'}));
    input.files = files.files; input.dispatchEvent(new Event('change', {bubbles: true}));
    const started = performance.now();
    while (!workers.some(worker => worker.ended === null)) {
      if (performance.now() - started > 10000) throw new Error('No active real map worker');
      await new Promise(requestAnimationFrame);
    }
    const worker = workers.find(worker => worker.ended === null);
    const samples = [], clicked = performance.now();
    document.querySelectorAll('.nav-item')[0].click();
    let visibleAt = null, blankFrames = 0;
    await new Promise(resolve => {
      const sample = time => {
        const root = document.querySelector('main .page-view');
        const visible = root && root.getBoundingClientRect().height > 0 && getComputedStyle(root).opacity !== '0' && root.textContent.trim().length > 10;
        if (!visible) blankFrames++;
        if (visible && location.pathname === '/home') visibleAt ??= performance.now();
        samples.push(time);
        if (samples.length < 60) requestAnimationFrame(sample); else resolve();
      };
      requestAnimationFrame(sample);
    });
    const report = {
      scenario: 'Real native WebView: 1024x1024 PNG, 320-block palette, relief; navigation during worker computation',
      frames: samples.length, maxFrameMs: Math.max(...samples.slice(1).map((time, index) => time - samples[index])),
      blankFrames, targetVisibleMs: visibleAt === null ? null : visibleAt - clicked,
      workerTerminateMs: worker.ended === null ? null : worker.ended - clicked,
      remainingWorkers: workers.filter(worker => worker.ended === null).length,
      hidden: document.hidden, heapBytes: performance.memory?.usedJSHeapSize,
    };
    window.__NATIVE_MAP_NAVIGATION__ = report;
    return report;
  } finally { window.Worker = OriginalWorker; }
}
