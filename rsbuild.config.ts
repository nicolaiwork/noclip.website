import { defineConfig, type RequestHandler } from '@rsbuild/core';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { execSync } from 'node:child_process';
import { readdir, writeFile } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import parseUrl from 'parseurl';
import send from 'send';

let gitCommit = '(unknown)';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Failed to fetch Git commit hash', e);
}

export default defineConfig({
  source: {
    entry: {
      index: './src/main.ts',
      embed: './src/main.ts',
    },
    // Legacy decorators are used with `reflect-metadata`.
    // TODO: Migrate to TypeScript 5.0 / TC39 decorators.
    decorators: {
      version: 'legacy',
    },
    define: {
      __COMMIT_HASH: JSON.stringify(gitCommit),
    },
  },
  html: {
    template: './src/index.html',
  },
  output: {
    target: 'web',
    // Mark Node.js built-in modules as external.
    externals: ['fs', 'path', 'url'],
    // TODO: These should be converted to use `new URL('./file.wasm', import.meta.url)`
    // so that the bundler can resolve them. In the meantime, they're expected to be
    // at the root.
    copy: [
      { from: 'src/**/*.wasm', to: '[name][ext]' },
      { from: 'node_modules/librw/lib/librw.wasm', to: 'static/js/[name][ext]' },
      { from: 'src/vendor/basis_universal/basis_transcoder.wasm', to: 'static/js/[name][ext]' },
    ],
  },
  // Enable async TypeScript type checking.
  plugins: [pluginTypeCheck()],
  tools: {
    rspack(config) {
      config.node = { ...config.node, __dirname: false };
    },
    // Disable standards-compliant class field transforms.
    swc: {
      jsc: {
        transform: {
          useDefineForClassFields: false,
        },
      },
    },
  },
  // Disable fallback to index for 404 responses.
  server: {
    htmlFallback: false,
  },
  // Setup middleware to serve the `data` directory.
  dev: {
    setupMiddlewares: [
      (middlewares, _server) => {
        middlewares.unshift(serveData, serveRoutes);
        return middlewares;
      },
    ],
  },
});

// Serve files from the `data` directory.
const serveData: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const matches = parseUrl(req)?.pathname?.match(/^\/data(\/.*)?$/);
  if (!matches) {
    next();
    return;
  }
  // The `send` package handles Range requests, conditional GET,
  // ETag generation, Cache-Control, Last-Modified, and more.
  const stream = send(req, matches[1] || '', {
    index: false,
    root: 'data',
  });
  stream.on(
    'directory',
    function handleDirectory(
      this: send.SendStream,
      res: ServerResponse,
      path: string,
    ) {
      // Print directory listing
      readdir(path, (err, list) => {
        if (err) return this.error(500, err);
        const filtered = list.filter((file) => !file.startsWith('.'));
        if (filtered.length === 0) return this.error(404);
        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        res.end(`${filtered.join('\n')}\n`);
      });
    },
  );
  stream.pipe(res);
};

// treadsim: serve the workspace's routes/ directory (../routes) under /routes/, listing included;
// PUT /routes/<slug>.json writes a route file from the in-browser editor (dev server, 127.0.0.1 only).
const ROUTE_FILE_RE = /^[a-z0-9][a-z0-9-]*\.json$/;
const serveRoutes: RequestHandler = (req, res, next) => {
  const pathname = parseUrl(req)?.pathname;
  const matches = pathname?.match(/^\/routes(\/.*)?$/);
  if (!matches) {
    next();
    return;
  }
  if (req.method === 'PUT') {
    const name = (matches[1] || '').slice(1);
    if (!ROUTE_FILE_RE.test(name)) {
      res.statusCode = 400;
      res.end('route file name must match ' + ROUTE_FILE_RE);
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      try {
        JSON.parse(body);
      } catch (e) {
        res.statusCode = 400;
        res.end('body is not JSON');
        return;
      }
      writeFile(join('../routes', name), body, (err) => {
        if (err) {
          res.statusCode = 500;
          res.end(String(err));
          return;
        }
        res.statusCode = 204;
        res.end();
      });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const stream = send(req, matches[1] || '', { index: false, root: '../routes' });
  stream.on(
    'directory',
    function handleDirectory(
      this: send.SendStream,
      res: ServerResponse,
      path: string,
    ) {
      readdir(path, (err, list) => {
        if (err) return this.error(500, err);
        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        res.end(`${list.filter((f) => !f.startsWith('.')).join('\n')}\n`);
      });
    },
  );
  stream.pipe(res);
};
