import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatApi, hostedBackend } from './chat-api.ts';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8787;
const EMBED_ORIGINS = process.env.SIRI_EMBED_ORIGINS || 'https://chag60460.github.io';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8',
};

const api = createChatApi();

function resolveAsset(url: string): string | null {
  const path = normalize(decodeURIComponent(url.split('?')[0] ?? '/'));
  const target = resolve(join(DIST, path === '/' ? 'index.html' : path));
  return target === DIST || target.startsWith(DIST + sep) ? target : null;
}

const server = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${EMBED_ORIGINS}`);

  if (request.url?.startsWith('/api/')) {
    void api.handle(request, response);
    return;
  }
  void (async () => {
    let target = resolveAsset(request.url ?? '/');
    if (!target) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    // Unknown paths fall back to the app shell so client-side screens keep working.
    const found = await stat(target).then(entry => entry.isFile()).catch(() => false);
    if (!found) target = join(DIST, 'index.html');
    response.writeHead(found ? 200 : 404, {
      'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    });
    createReadStream(target).pipe(response);
  })();
});

server.on('error', error => {
  const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
  console.error(busy ? `Port ${PORT} is already in use. Stop the other server, or start this one with a different PORT.` : `The server failed to start: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Siri prototype listening on port ${PORT}. Hosted AI backend: ${hostedBackend() ? 'enabled' : 'disabled'}.`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void api.close().catch(() => console.error('The chat backend did not close cleanly.')).finally(() => process.exit(0));
  });
}
