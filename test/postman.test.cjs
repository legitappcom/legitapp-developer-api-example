const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const newman = require('newman');
const { createApp } = require('../dist/app');
const { webhookEventTypes } = require('../dist/types');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const flatten = items => items.flatMap(item => item.item ? flatten(item.item) : [item]);
const run = options => new Promise((resolve, reject) => {
  newman.run({ ...options, reporters: [], timeoutRequest: 3000 }, (error, summary) => error ? reject(error) : resolve(summary));
});
const listen = server => new Promise(resolve => {
  const listener = server.listen(0, '127.0.0.1', () => resolve({ server: listener, url: `http://127.0.0.1:${listener.address().port}` }));
});
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

test('exports have distinct environments, blank credentials and Sandbox as the direct default', () => {
  const direct = read('postman/LegitApp-Developer-API.postman_collection.json');
  const local = read('postman/LegitApp-Local-Example.postman_collection.json');
  assert.equal(direct.auth.type, 'bearer');
  assert.equal(direct.variable[0].value, 'https://developer-api-a7zu.legitapp.com/v1');
  assert.equal(local.auth.type, 'noauth');
  for (const name of ['Sandbox', 'Production']) {
    const values = Object.fromEntries(read(`postman/environments/${name}.postman_environment.json`).values.map(value => [value.key, value.value]));
    assert.equal(values.developer_secret, '');
    for (const key of ['authentication_id', 'pdf_authentication_id', 'cancel_authentication_id']) assert.equal(values[key], '');
  }
  assert(flatten(direct.item).every(item => item.request.description && item.response.length));
  assert.equal(flatten(local.item).filter(item => item.name.startsWith('Simulate')).length, webhookEventTypes.length);
});

for (const local of [false, true]) {
  test(`${local ? 'local example' : 'direct API'} collection runs through Newman with real scripts and isolated HTTP`, async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'legitapp-postman-test-'));
    const filename = path.join(folder, 'photo.png');
    fs.writeFileSync(filename, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/vX8AAAAASUVORK5CYII=', 'base64'));
    const calls = [];
    const mock = await listen(http.createServer(async (req, res) => {
      const parts = [];
      for await (const part of req) parts.push(part);
      const body = Buffer.concat(parts).toString();
      calls.push({ method: req.method, url: req.url, body });
      res.setHeader('Content-Type', 'application/json');
      const uri = new URL(req.url, 'http://127.0.0.1');
      assert.equal(req.headers.authorization, 'Bearer placeholder-test-secret');
      if (uri.pathname.endsWith('/asset_image')) {
        assert.match(body, /name="file"/);
        res.statusCode = 201; return res.end(JSON.stringify({ url: `https://example.com/upload-${calls.length}.png` }));
      }
      if (uri.pathname.endsWith('/token_balance')) return res.end(JSON.stringify({ token_balance: 20 }));
      if (uri.pathname.endsWith('/authentication_set')) return res.end(JSON.stringify({ id: 1, turn_around_time_list: [{ id: 1 }], guideline: [], placeholder: [] }));
      if (/\/product_(category|brand|model)$/.test(uri.pathname)) return res.end(JSON.stringify({ data: [{ id: 1, title: 'Example' }] }));
      if (uri.pathname.endsWith('/authentication_intent')) {
        assert.equal(JSON.parse(body).user_custom_code, 'ABC "example" / code');
        res.statusCode = 201;
        return res.end(JSON.stringify({ authentication_intent_id: '0123456789012345', authentication_url: 'https://example.com/hosted' }));
      }
      if (req.method === 'POST' && uri.pathname === '/v1/authentication') {
        const input = JSON.parse(body);
        assert.equal(input.authentication_set_id, 1);
        assert.equal(input.turnaround_time_id, 1);
        assert(input.images.length && input.images[0].service_placeholder_id === 1);
        assert.equal(input.user_custom_code, 'ABC "example" / code');
        res.statusCode = 201; return res.end(JSON.stringify({ authentication_id: '0123456789012345' }));
      }
      if (uri.pathname.endsWith('/pdf_certificate')) return res.end(JSON.stringify({ authentication_id: '0123456789012345', certificate_pdf_url: 'https://example.com/current.pdf' }));
      if (uri.pathname.endsWith('/cancel') || uri.pathname.endsWith('/photo')) return res.end(JSON.stringify({ success: true }));
      return res.end(JSON.stringify({ authentication_id: '0123456789012345', certificate_pdf_url: null }));
    }));
    const handlers = Object.fromEntries(webhookEventTypes.map(type => [type, async () => {}]));
    const app = local ? await listen(createApp({ apiBaseUrl: `${mock.url}/v1`, developerSecretKey: 'placeholder-test-secret' }, handlers)) : null;
    try {
      const collection = read(`postman/${local ? 'LegitApp-Local-Example' : 'LegitApp-Developer-API'}.postman_collection.json`);
      for (const item of flatten(collection.item)) if (item.request.body?.mode === 'formdata') item.request.body.formdata[0].src = filename;
      const environment = read(`postman/environments/${local ? 'Local-Example' : 'Sandbox'}.postman_environment.json`);
      const overrides = {
        api_base_url: `${mock.url}/v1`, example_base_url: app?.url,
        developer_secret: 'placeholder-test-secret', category_id: '1', brand_id: '1', model_id: '1',
        authentication_set_id: '1', turnaround_time_id: '1', service_placeholder_id: '1', tag_id: 'TAG123',
        pdf_authentication_id: '0123456789012345', cancel_authentication_id: '0123456789012345',
        user_custom_code: 'ABC "example" / code',
      };
      for (const value of environment.values) if (overrides[value.key] !== undefined) value.value = overrides[value.key];
      const summary = await run({ collection, environment });
      assert.equal(summary.run.failures.length, 0, JSON.stringify(summary.run.failures));
      assert.equal(summary.run.executions.length, local ? 22 : 16);
      assert.equal(calls.length, 16);
      const state = summary.environment.toObject();
      assert.equal(state.authentication_id, '0123456789012345');
      assert.equal(state.certificate_pdf_url, 'https://example.com/current.pdf');
      assert.equal(JSON.parse(state.images_json).length, 1);
      assert.equal(JSON.parse(state.additional_images_json).length, 1);
      assert(calls.some(call => call.url.includes('/authentication/user_custom_code/ABC%20%22example%22%20%2F%20code')));
      assert(summary.run.stats.assertions.total > 20);
    } finally {
      if (app) await close(app.server);
      await close(mock.server);
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
}

test('an incompatible environment stops the request instead of calling the configured server', async () => {
  let calls = 0;
  const mock = await listen(http.createServer((_req, res) => { calls += 1; res.end('{}'); }));
  try {
    const collection = read('postman/LegitApp-Developer-API.postman_collection.json');
    collection.item = [collection.item[0]];
    const environment = { values: [
      { key: 'target', value: 'local-example', enabled: true },
      { key: 'api_base_url', value: mock.url, enabled: true },
      { key: 'developer_secret', value: 'placeholder-test-secret', enabled: true },
    ] };
    await run({ collection, environment });
    assert.equal(calls, 0);
  } finally { await close(mock.server); }
});
