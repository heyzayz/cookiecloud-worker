// CookieCloud API on Cloudflare Workers.
// Faithful port of server/api/app.js, storing data in Cloudflare KV.
//
// Endpoints (API_ROOT env can add a subdirectory prefix, e.g. /cookie):
//   GET  {root}/            -> greeting
//   GET  {root}/health      -> health check
//   POST {root}/update      -> { uuid, encrypted, crypto_type? }  (accepts gzip body)
//   GET/POST {root}/get/:uuid -> returns stored data; with password -> decrypted content

import { decryptData } from './crypto.js';

const START_TIME = Date.now();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
  'Access-Control-Max-Age': '86400',
};

// Simple in-memory rate limiter (per isolate). For real protection across
// all instances, use Cloudflare's Rate Limiting product instead.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 100;
const rateBuckets = new Map();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra },
  });
}

function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'
  );
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = rateBuckets.get(ip);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (rateBuckets.size > 10000) rateBuckets.clear();
  return entry.count > RATE_MAX;
}

// Read JSON body, transparently decompressing gzip (as sent by the extension)
async function readJsonBody(request) {
  const encoding = (request.headers.get('Content-Encoding') || '').toLowerCase();
  if (encoding.includes('gzip')) {
    const stream = request.body.pipeThrough(new DecompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }
  return request.json();
}

async function handleUpdate(request, env) {
  try {
    const body = await readJsonBody(request);
    const { encrypted, uuid, crypto_type = 'legacy' } = body || {};
    if (!encrypted || !uuid) {
      return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
    }
    const safeUuid = String(uuid).replace(/[\\/]/g, '');
    await env.COOKIE_KV.put(safeUuid, JSON.stringify({ encrypted, crypto_type }));
    return json({ action: 'done' });
  } catch (err) {
    console.error('update error:', err);
    return new Response('Internal Serverless Error', { status: 500, headers: CORS_HEADERS });
  }
}

async function handleGet(request, env, rawUuid) {
  try {
    const url = new URL(request.url);
    const cryptoType = url.searchParams.get('crypto_type');
    const safeUuid = rawUuid.replace(/[\\/]/g, '');

    const stored = await env.COOKIE_KV.get(safeUuid);
    if (!stored) {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }
    const data = JSON.parse(stored);

    let password = null;
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      password = body.password;
    }
    if (!password) {
      password = url.searchParams.get('password');
    }

    if (password) {
      const useCryptoType = cryptoType || data.crypto_type || 'legacy';
      const parsed = await decryptData(safeUuid, data.encrypted, password, useCryptoType);
      return json(parsed);
    }
    return json(data);
  } catch (err) {
    console.error('get error:', err);
    return new Response('Internal Serverless Error', { status: 500, headers: CORS_HEADERS });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const apiRoot = (env.API_ROOT || '').trim().replace(/\/+$/, '');
    const path = url.pathname;

    // CORS preflight; echo requested headers like the original cors() middleware
    if (request.method === 'OPTIONS') {
      const headers = { ...CORS_HEADERS };
      const requested = request.headers.get('Access-Control-Request-Headers');
      if (requested) headers['Access-Control-Allow-Headers'] = requested;
      return new Response(null, { status: 204, headers });
    }

    if (rateLimited(clientIp(request))) {
      return json({ error: 'Too Many Requests' }, 429);
    }

    const healthPath = apiRoot + '/health';
    if (path === healthPath) {
      return json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: (Date.now() - START_TIME) / 1000,
      });
    }

    if (path === apiRoot || path === apiRoot + '/') {
      return new Response('Hello World!' + 'API ROOT = ' + apiRoot, { headers: CORS_HEADERS });
    }

    const updatePath = apiRoot + '/update';
    if (path === updatePath && request.method === 'POST') {
      return handleUpdate(request, env);
    }

    const getPrefix = apiRoot + '/get/';
    if (path.startsWith(getPrefix) && path.length > getPrefix.length) {
      if (request.method === 'GET' || request.method === 'POST') {
        return handleGet(request, env, decodeURIComponent(path.slice(getPrefix.length)));
      }
    }

    return json(
      {
        error: 'Not Found',
        message: `The requested URL ${path} was not found on this worker.`,
        path,
        method: request.method,
        timestamp: new Date().toISOString(),
      },
      404
    );
  },
};
