const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { createApp } = require('../dist/app');
const { webhookEventTypes } = require('../dist/types');

async function listen(app) {
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function close(server) {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
async function fixture(run, options = {}) {
  const calls = [];
  const upstream = await listen(http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = Buffer.concat(parts).toString();
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (options.reply) return options.reply(req, res);
    res.setHeader('Content-Type', 'application/json');
    const uri = new URL(req.url, 'http://127.0.0.1');
    if (uri.pathname.endsWith('/asset_image')) {
      res.statusCode = 201; return res.end(JSON.stringify({ url: 'https://example.com/upload.jpg' }));
    }
    if (uri.pathname.endsWith('/authentication_intent')) {
      res.statusCode = 201; return res.end(JSON.stringify({ authentication_intent_id: '0123456789012345', authentication_url: 'https://example.com/hosted' }));
    }
    if (req.method === 'POST' && uri.pathname === '/v1/authentication') {
      res.statusCode = 201; return res.end(JSON.stringify({ authentication_id: '0123456789012345' }));
    }
    if (uri.pathname.endsWith('/pdf_certificate')) return res.end(JSON.stringify({ authentication_id: '0123456789012345', certificate_pdf_url: 'https://example.com/current.pdf' }));
    if (uri.pathname.endsWith('/cancel') || uri.pathname.endsWith('/photo')) return res.end(JSON.stringify({ success: true }));
    return res.end(JSON.stringify({ data: [], authentication_id: '0123456789012345', certificate_url: 'https://example.com/cert' }));
  }));
  const app = await listen(createApp({ apiBaseUrl: `${upstream.url}/v1/`, developerSecretKey: 'placeholder-test-secret', ...options.config }, options.handlers));
  try { await run({ ...app, calls }); } finally { await close(app.server); await close(upstream.server); }
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('catalog proxy translates only documented query names and uses the server credential', async () => {
  await fixture(async ({ url, calls }) => {
    for (const route of ['/categories', '/brands?categoryId=2', '/models?categoryId=2&brandId=3', '/authentication_sets?categoryId=2&brandId=3&modelId=4', '/token-balance']) {
      const response = await fetch(url + route, { headers: { Authorization: 'Bearer untrusted-caller-key', 'Accept-Language': 'ja' } });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(calls.map(call => call.url), ['/v1/product_category', '/v1/product_brand?category_id=2', '/v1/product_model?category_id=2&brand_id=3', '/v1/authentication_set?category_id=2&brand_id=3&model_id=4', '/v1/token_balance']);
    assert(calls.every(call => call.headers.authorization === 'Bearer placeholder-test-secret'));
    assert(calls.every(call => call.headers['accept-language'] === 'ja'));
  });
});

test('multipart image uses the upstream file field and boundary, preserves 201 and maps the URL', async () => {
  await fixture(async ({ url, calls }) => {
    const form = new FormData();
    form.append('image', new Blob(['placeholder-image'], { type: 'image/jpeg' }), 'example.jpg');
    const response = await fetch(`${url}/upload-image`, { method: 'POST', body: form });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { image_url: 'https://example.com/upload.jpg' });
    assert.match(calls[0].headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.match(calls[0].body, /name="file"; filename="example.jpg"/);
    assert.match(calls[0].body, /placeholder-image/);
  });
});

test('missing and oversized local uploads have clear 400/413 responses', async () => {
  await fixture(async ({ url, calls }) => {
    assert.equal((await fetch(`${url}/upload-image`, { method: 'POST' })).status, 400);
    const form = new FormData();
    form.append('image', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]), 'too-large.jpg');
    const response = await fetch(`${url}/upload-image`, { method: 'POST', body: form });
    assert.equal(response.status, 413);
    assert.equal(calls.length, 0);
  });
});

test('submission uses current fields and preserves the leading-zero authentication ID', async () => {
  await fixture(async ({ url, calls }) => {
    const body = { authentication_set_id: 5, category_id: 2, brand_id: 3, model_id: 4, turnaround_time_id: 6, images: [{ image_url: 'https://example.com/image.jpg', service_placeholder_id: 9 }], user_custom_code: 'demo' };
    const response = await fetch(`${url}/submit-authentication`, json('POST', body));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).authentication_id, '0123456789012345');
    assert.deepEqual(JSON.parse(calls[0].body), body);
    assert.equal(JSON.parse(calls[0].body).service_level_id, undefined);
  });
});

test('detail lookups, PDF, cancellation, extra photos and hosted intents call the correct API routes', async () => {
  await fixture(async ({ url, calls }) => {
    const id = '0123456789012345';
    assert.equal((await fetch(`${url}/authentications/${id}`)).status, 200);
    assert.equal((await fetch(`${url}/authentications/tag/TAG123`)).status, 200);
    assert.equal((await fetch(`${url}/authentications/user-custom-code/${encodeURIComponent('ABC / 1')}`)).status, 200);
    const pdf = await fetch(`${url}/authentications/${id}/pdf_certificate`, { method: 'POST' });
    assert.equal((await pdf.json()).certificate_pdf_url, 'https://example.com/current.pdf');
    assert.equal((await fetch(`${url}/authentications/${id}/cancel`, json('PATCH', { accountId: 999, force: true }))).status, 200);
    assert.equal((await fetch(`${url}/submit-additional-photos-for-authentication/${id}`, json('POST', { images: [] }))).status, 200);
    const intent = { category_id: 1, user_custom_code_enabled: true, user_custom_code: 'example', language: 'ja' };
    assert.equal((await fetch(`${url}/authentication-intents`, json('POST', intent))).status, 201);
    assert.deepEqual(calls.map(call => [call.method, call.url]), [
      ['GET', `/v1/authentication/${id}`], ['GET', '/v1/authentication/tag/TAG123'], ['GET', '/v1/authentication/user_custom_code/ABC%20%2F%201'],
      ['POST', `/v1/authentication/${id}/pdf_certificate`], ['PATCH', `/v1/authentication/${id}/cancel`],
      ['POST', `/v1/authentication/${id}/photo`], ['POST', '/v1/authentication_intent'],
    ]);
    assert.equal(calls[4].body, '');
    assert.deepEqual(JSON.parse(calls[6].body), intent);
  });
});

test('upstream API error status and errors array are preserved', async () => {
  const body = { errors: [{ id: 'INVALID_REQUEST', message: 'Only completed Authentic or Replica cases qualify.', code: 400 }] };
  await fixture(async ({ url }) => {
    const response = await fetch(`${url}/authentications/0123456789012345/pdf_certificate`, { method: 'POST' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), body);
  }, { reply: (_req, res) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); } });
});

test('unexpected upstream bodies and credentials are excluded from example error responses', async () => {
  await fixture(async ({ url }) => {
    const response = await fetch(`${url}/categories`);
    assert.equal(response.status, 502);
    const body = JSON.stringify(await response.json());
    assert(!body.includes('private-upstream-detail') && !body.includes('placeholder-test-secret'));
  }, { reply: (_req, res) => { res.writeHead(500); res.end('private-upstream-detail'); } });
});

test('upstream redirects are not followed', async () => {
  await fixture(async ({ url, calls }) => {
    assert.equal((await fetch(`${url}/categories`)).status, 502);
    assert.equal(calls.length, 1);
  }, { reply: (_req, res) => { res.writeHead(302, { Location: '/should-not-be-called' }); res.end(); } });
});

test('a slow upstream returns a bounded timeout response', async () => {
  await fixture(async ({ url }) => {
    assert.equal((await fetch(`${url}/categories`)).status, 504);
  }, { config: { timeoutMs: 30 }, reply: () => {} });
});

test('all documented webhook fixtures reach their own switch branch', async () => {
  const seen = [];
  const handlers = Object.fromEntries(webhookEventTypes.map(type => [type, async event => { seen.push(event.type); }]));
  await fixture(async ({ url, calls }) => {
    for (const type of webhookEventTypes) {
      const event = JSON.parse(fs.readFileSync(`postman/fixtures/${type.split('.')[1]}.json`, 'utf8'));
      const response = await fetch(`${url}/webhook`, json('POST', event));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { received: true, event_type: type });
    }
    assert.deepEqual(seen, [...webhookEventTypes]);
    assert.equal(calls.length, 0);
  }, { handlers });
});

test('a handler failure is not acknowledged and a subsequent delivery can succeed', async () => {
  let attempts = 0;
  await fixture(async ({ url }) => {
    const event = { id: 'evt-retry', type: 'authentication.completed', data: {} };
    const first = await fetch(`${url}/webhook`, json('POST', event));
    assert.equal(first.status, 500);
    assert(!JSON.stringify(await first.json()).includes('private-handler-detail'));
    const second = await fetch(`${url}/webhook`, json('POST', event));
    assert.equal(second.status, 200);
    assert.equal(attempts, 2);
  }, { handlers: { 'authentication.completed': async () => { attempts += 1; await Promise.resolve(); if (attempts === 1) throw new Error('private-handler-detail'); } } });
});

test('webhook validation rejects malformed events, while unknown event types are acknowledged', async () => {
  await fixture(async ({ url }) => {
    assert.equal((await fetch(`${url}/webhook`, json('POST', { type: 'authentication.completed' }))).status, 400);
    assert.equal((await fetch(`${url}/webhook`, json('POST', { id: 'evt', type: 'future.event', data: {} }))).status, 200);
    assert.equal((await fetch(`${url}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  });
});

test('a configured private webhook path replaces the public demo path', async () => {
  await fixture(async ({ url }) => {
    const event = { id: 'evt', type: 'authentication.completed', data: {} };
    assert.equal((await fetch(`${url}/webhook`, json('POST', event))).status, 404);
    assert.equal((await fetch(`${url}/webhook/test-token`, json('POST', event))).status, 200);
  }, { config: { webhookPath: '/webhook/test-token' }, handlers: { 'authentication.completed': async () => {} } });
});
