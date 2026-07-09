import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { request } from 'node:http';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 8080);
const root = existsSync(join(process.cwd(), 'dist'))
  ? join(process.cwd(), 'dist')
  : join(process.cwd(), 'apps/web/dist');
const apiTarget = process.env.API_TARGET || 'http://api:4000';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (req.url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = join(root, safePath === '/' ? 'index.html' : safePath);
  const filePath = existsSync(requestedPath) ? requestedPath : join(root, 'index.html');
  const ext = extname(filePath);

  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`law-ai-web listening on ${port}`);
});

function proxyApi(clientReq, clientRes) {
  const target = new URL(clientReq.url || '/', apiTarget);
  const proxyReq = request(
    target,
    {
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: target.host
      }
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on('error', () => {
    clientRes.writeHead(502, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({ error: 'API_PROXY_FAILED' }));
  });

  clientReq.pipe(proxyReq);
}
