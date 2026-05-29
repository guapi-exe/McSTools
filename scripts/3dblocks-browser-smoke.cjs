const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
const tempRoot = path.join(root, '.tmp');
const useHeadless = process.env.THREEDBLOCKS_HEADLESS === '1' || process.env.CI === 'true';

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.eot', 'application/vnd.ms-fontobject'],
]);

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const browserFlagSets = [
  {
    name: 'swiftshader-angle',
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
  },
  {
    name: 'swiftshader-gl',
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-gpu-sandbox'],
  },
  {
    name: 'in-process-gpu',
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--in-process-gpu', '--disable-gpu-sandbox'],
  },
  {
    name: 'default-browser',
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  },
];

const findBrowsers = () => {
  const browsers = [...new Set(browserCandidates)].filter((candidate) => fs.existsSync(candidate));
  if (browsers.length === 0) {
    throw new Error('No Chrome/Edge executable found. Set CHROME_PATH to run the 3DBLOCKS browser smoke test.');
  }
  return browsers;
};

const readRequestBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const createServer = () => {
  let resolveResult;
  let rejectResult;
  const requests = [];
  const resultPromise = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (requests.length < 40) {
        requests.push(`${req.method || 'GET'} ${url.pathname}${url.search}`);
      }
      if (req.method === 'POST' && url.pathname === '/__3dblocks_smoke_result') {
        const body = await readRequestBody(req);
        const result = JSON.parse(body);
        res.writeHead(204);
        res.end();
        resolveResult(result);
        return;
      }

      let filePath = path.resolve(distRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!filePath.startsWith(distRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distRoot, 'index.html');
      }

      res.writeHead(200, {
        'content-type': mime.get(path.extname(filePath)) || 'application/octet-stream',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
      rejectResult(error);
    }
  });

  return { server, resultPromise, requests };
};

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    resolve(server.address().port);
  });
});

const closeServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const safeName = (value) => value.replace(/[^a-z0-9_.-]+/gi, '-');

const killBrowserTree = (child) => {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    childProcess.spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGKILL');
};

const runBrowser = (browserPath, url, extraArgs, attemptName) => {
  const profileDir = path.join(tempRoot, `3dblocks-smoke-${process.pid}-${Date.now()}-${safeName(attemptName)}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const args = [
    ...(useHeadless ? ['--headless=new'] : ['--window-size=900,700']),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--ignore-certificate-errors',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    ...extraArgs,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];

  const child = childProcess.spawn(browserPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  let resolveDevtools;
  const devtoolsPromise = new Promise((resolve) => {
    resolveDevtools = resolve;
  });
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) {
      resolveDevtools(Number(match[1]));
    }
  });

  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });

  return { child, exitPromise, profileDir, devtoolsPromise };
};

const requestDevtoolsNewPage = (port, url, method = 'PUT') => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: `/json/new?${encodeURIComponent(url)}`,
    method,
  }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve(body);
      } else {
        reject(new Error(`DevTools /json/new returned ${res.statusCode}: ${body}`));
      }
    });
  });
  req.on('error', reject);
  req.end();
});

const openDevtoolsPage = async (port, url) => {
  try {
    return await requestDevtoolsNewPage(port, url, 'PUT');
  } catch {
    return requestDevtoolsNewPage(port, url, 'GET');
  }
};

const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  promise.then(
    (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    (error) => {
      clearTimeout(timer);
      reject(error);
    },
  );
});

const main = async () => {
  if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
    throw new Error('dist/index.html is missing. Run `npm run build` before this smoke test.');
  }

  const browsers = findBrowsers();
  const failures = [];

  for (const browserPath of browsers) {
    for (const flagSet of browserFlagSets) {
      try {
        const result = await runAttempt(browserPath, flagSet);
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) {
          throw new Error(`3DBLOCKS browser smoke failed: ${result.error || JSON.stringify(result)}`);
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${path.basename(browserPath)} ${flagSet.name}: ${message}`);
        console.warn(`[3DBLOCKS smoke] attempt failed: ${path.basename(browserPath)} ${flagSet.name}: ${message}`);
      }
    }
  }

  throw new Error(`All 3DBLOCKS browser smoke attempts failed.${os.EOL}${failures.join(os.EOL)}`);
};

const runAttempt = async (browserPath, flagSet) => {
  const { server, resultPromise, requests } = createServer();
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/?3dblocksSmoke=1&3dblocksSmokeReport=1`;
  const attemptName = `${path.basename(browserPath)}-${flagSet.name}`;
  const { child, exitPromise, profileDir, devtoolsPromise } = runBrowser(browserPath, url, flagSet.args, attemptName);

  try {
    const devtoolsPort = await withTimeout(devtoolsPromise, 10000, 'Chrome DevTools endpoint');
    await openDevtoolsPage(devtoolsPort, url);
    const result = await withTimeout(resultPromise, 15000, '3DBLOCKS browser smoke result');
    killBrowserTree(child);
    await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);
    return result;
  } catch (error) {
    killBrowserTree(child);
    const browserExit = await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (browserExit?.stderr) {
      console.error(browserExit.stderr);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}; requests=${requests.join(' | ') || '(none)'}`);
  } finally {
    await closeServer(server);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // Browser crash handlers can keep files open briefly on Windows.
    }
    try {
      fs.rmdirSync(tempRoot);
    } catch {
      // Other temporary files may still exist.
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
