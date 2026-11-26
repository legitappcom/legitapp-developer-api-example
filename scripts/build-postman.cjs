// Generate both collections from one endpoint list. Run npm run postman:build after edits.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sandbox = 'https://developer-api-a7zu.legitapp.com/v1';
const production = 'https://developer-api.legitapp.com/v1';
const schema = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const eventTypes = ['cancelled', 'initial_photo_submission', 'new_message', 'extra_photo', 'extra_photo_submission', 'completed'];
const files = new Map();
const save = (name, value) => files.set(name, `${JSON.stringify(value, null, 2)}\n`);
const event = (listen, source) => ({ listen, script: { type: 'text/javascript', exec: source.trim().split('\n') } });
const guard = source => `try {\n${source}\n} catch (error) {\n  console.error(error.message);\n  pm.execution.skipRequest();\n  throw error;\n}`;
const requireFields = (fields = []) => fields.map(key => `
if (!String(pm.environment.get('${key}') || '').trim()) {
  throw new Error('Set ${key} in the selected environment. See this request description.');
}`).join('\n');
const requireIntegers = keys => keys.map(key => `
if (!/^[1-9][0-9]*$/.test(String(pm.environment.get('${key}') || ''))) {
  throw new Error('Set ${key} to an ID returned by the catalog in this environment.');
}`).join('\n');
const requireImages = key => `
const images = JSON.parse(pm.environment.get('${key}') || '[]');
if (!Array.isArray(images) || !images.length || images.some(image => !image || !/^https?:\\/\\//.test(image.image_url || ''))) {
  throw new Error('Upload the required images first; ${key} must be a non-empty JSON array of image objects.');
}`;
const script = (status, extra = '') => `
pm.test('HTTP status is ${status}', function () {
  if (pm.response.code !== ${status}) throw new Error('Expected ${status}; received ' + pm.response.code + '. Check the response body and this request prerequisites.');
});
if (pm.response.code === ${status}) {
  const body = pm.response.json();
  ${extra}
}`;
const has = (condition, description) => `pm.test(${JSON.stringify(description)}, function () { if (!(${condition})) throw new Error(${JSON.stringify(description)}); });`;
const keepId = field => `
${has(`typeof body.${field} === 'string' && body.${field}.length > 0`, `${field} is a string`)}
if (typeof body.${field} === 'string') pm.environment.set('${field}', body.${field});`;
const keepUpload = (local, buffer) => {
  const field = local ? 'image_url' : 'url';
  return `
${has(`typeof body.${field} === 'string' && /^https?:\\/\\//.test(body.${field})`, 'Upload returns an image URL')}
if (typeof body.${field} === 'string' && /^https?:\\/\\//.test(body.${field})) {
  const images = JSON.parse(pm.environment.get('${buffer}') || '[]');
  const image = { image_url: body.${field} };
  const placeholder = pm.environment.get('service_placeholder_id');
  if (placeholder) image.service_placeholder_id = Number(placeholder);
  if (!images.some(current => current.image_url === image.image_url && current.service_placeholder_id === image.service_placeholder_id)) images.push(image);
  pm.environment.set('${buffer}', JSON.stringify(images));
  pm.environment.set('image_url', body.${field});
}`;
};
const authenticationBody = `{
  "authentication_set_id": {{authentication_set_id}},
  "category_id": {{category_id}},
  "brand_id": {{brand_id}},
  "model_id": {{model_id}},
  "turnaround_time_id": {{turnaround_time_id}},
  "images": {{images_json}},
  "user_custom_code": {{user_custom_code_json}},
  "user_remark": {{user_remark_json}}
}`;
const additionalBody = `{
  "images": {{additional_images_json}},
  "user_remark": {{user_remark_json}}
}`;
const intentBody = `{
  "language": "{{language}}",
  "user_custom_code": {{user_custom_code_json}}
}`;
const restrictedIntentBody = `{
  "category_id": {{category_id}},
  "brand_id": {{brand_id}},
  "model_id": {{model_id}},
  "tag_enabled": false,
  "user_custom_code_enabled": true,
  "user_custom_code": {{user_custom_code_json}},
  "language": "{{language}}"
}`;
const sampleId = '0123456789012345';
const detail = {
  authentication_id: sampleId, authentication_token: 2, item: 'Example item', item_full: 'Example item',
  cover_image: 'https://example.com/image.jpg', turnaround_time: 1440,
  status: 'completed', result: 'authentic', fake_rating: null,
  category_id: 1, brand_id: 1, model_id: 1, tag_id: null, user_custom_code: 'postman-demo', user_remark: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
  images: [], logs: [], extra_photo_requests: [], certificate_pdf_url: null,
};
const denied = { errors: [{ id: 'INVALID_PERMISSION', message: 'You are not allowed to access the resources.', code: 403 }] };
const notFound = { errors: [{ id: 'NOT_FOUND', message: 'The selected authentication is not available. Please select again.', code: 404 }] };
const invalid = { errors: [{ id: 'INVALID_REQUEST', message: 'The request does not meet the endpoint prerequisites.', code: 400 }] };

for (const local of [false, true]) {
  const base = local ? '{{example_base_url}}' : '{{api_base_url}}';
  const make = (name, method, remote, alias, status, description, options = {}) => {
    const routePath = local ? alias : remote;
    const raw = `${base}${routePath}`;
    const [pathname, queryString] = routePath.split('?');
    const request = {
      method,
      header: [{ key: 'Accept-Language', value: '{{language}}', type: 'text' }],
      url: {
        raw, host: [base], path: pathname.replace(/^\//, '').split('/'),
        ...(queryString ? { query: queryString.split('&').map(pair => {
          const [key, value] = pair.split('='); return { key, value };
        }) } : {}),
      },
      description,
    };
    if (options.body) {
      request.header.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
      request.body = { mode: 'raw', raw: options.body, options: { raw: { language: 'json' } } };
    }
    if (options.upload) request.body = { mode: 'formdata', formdata: [{ key: local ? 'image' : 'file', type: 'file', src: '' }] };
    const events = [];
    if (options.pre) events.push(event('prerequest', guard(options.pre)));
    events.push(event('test', script(status, options.test)));
    const example = (code, body, label) => ({
      name: `${code} ${label} (illustrative)`, originalRequest: request,
      status: ({ 200: 'OK', 201: 'Created', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found' })[code], code,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: JSON.stringify(body, null, 2),
    });
    return { name, request, event: events, response: [
      ...(options.example ? [example(status, options.example, 'success')] : []),
      example(403, denied, 'invalid or missing developer credential'),
      ...(options.notFound ? [example(404, notFound, 'unavailable or ineligible authentication')] : []),
      ...(options.invalid ? [example(400, invalid, 'prerequisites not met; actual message explains the reason')] : []),
    ] };
  };
  const folder = (name, description, item) => ({ name, description, item });
  const catalogIds = ['category_id', 'brand_id', 'model_id'];
  const intentTests = `${keepId('authentication_intent_id')}
${has("typeof body.authentication_url === 'string' && /^https:\\/\\//.test(body.authentication_url)", 'Intent returns a hosted submission URL')}
if (typeof body.authentication_url === 'string') pm.environment.set('authentication_url', body.authentication_url);
if (typeof body.authentication_intent_id === 'string') pm.environment.set('authentication_id', body.authentication_intent_id);`;
  const collection = {
    info: { name: local ? 'LegitApp Integration Example - Local' : 'LegitApp Developer API', schema,
      description: local
        ? 'Calls the local TypeScript/Express example, which forwards API calls using its .env credentials. Start the server and select the Local Example environment. Webhook requests are simulations only. See postman/README.md.'
        : 'Calls the LegitApp Developer API directly. Import and select Sandbox first; enter your Sandbox developer secret locally. Production is a separate environment. Follow folders in order; read prerequisites before conditional operations. No local server is required. See postman/README.md.',
    },
    auth: local ? { type: 'noauth' } : { type: 'bearer', bearer: [{ key: 'token', value: '{{developer_secret}}', type: 'string' }] },
    variable: [{ key: local ? 'example_base_url' : 'api_base_url', value: local ? 'http://127.0.0.1:3000' : sandbox }],
    event: [event('prerequest', guard(`
const target = pm.environment.get('target');
if (${local ? "target !== 'local-example'" : "!['sandbox', 'production'].includes(target)"}) throw new Error('Select the matching ${local ? 'Local Example' : 'Sandbox or Production'} environment first.');
${local ? '' : "if (!pm.environment.get('developer_secret')) throw new Error('Set developer_secret locally in the selected environment.');"}
pm.variables.set('user_custom_code_json', JSON.stringify(pm.environment.get('user_custom_code') || null));
pm.variables.set('user_remark_json', JSON.stringify(pm.environment.get('user_remark') || null));
pm.variables.set('encoded_user_custom_code', encodeURIComponent(pm.environment.get('user_custom_code') || ''));
const placeholder = pm.environment.get('service_placeholder_id');
if (placeholder && !/^[1-9][0-9]*$/.test(String(placeholder))) throw new Error('service_placeholder_id must be blank or a positive placeholder ID from the selected authentication set.');
`))],
    item: [
      folder('01 - Account', 'Confirm that the selected environment and credential work.', [
        make('Get token balance', 'GET', '/token_balance', '/token-balance', 200, 'Returns the current account token balance, which may be fractional.', { test: has("typeof body.token_balance === 'number'", 'Token balance is numeric'), example: { token_balance: 20 } }),
      ]),
      folder('02 - Catalog', 'Choose matching IDs from this environment. The examples never silently pick the first category, brand, model or turnaround time.', [
        make('Find categories', 'GET', '/product_category', '/categories', 200, 'Choose a category from data and set category_id.', { test: has('Array.isArray(body.data)', 'Catalog contains a data array'), example: { data: [{ id: 1, title: 'Sneakers', icon_image_url: 'https://example.com/category.png' }] } }),
        make('Find brands', 'GET', '/product_brand?category_id={{category_id}}', '/brands?categoryId={{category_id}}', 200, 'Choose a brand under the selected category and set brand_id.', { pre: requireIntegers(['category_id']), test: has('Array.isArray(body.data)', 'Catalog contains a data array'), example: { data: [{ id: 1, title: 'Example brand', slug: 'example', icon_image_url: null }] } }),
        make('Find models', 'GET', '/product_model?category_id={{category_id}}&brand_id={{brand_id}}', '/models?categoryId={{category_id}}&brandId={{brand_id}}', 200, 'Choose a model and set model_id.', { pre: requireIntegers(['category_id', 'brand_id']), test: has('Array.isArray(body.data)', 'Catalog contains a data array'), example: { data: [{ id: 1, title: 'Example model', slug: 'example', icon_image_url: null }] } }),
        make('Get authentication set', 'GET', '/authentication_set?category_id={{category_id}}&brand_id={{brand_id}}&model_id={{model_id}}', '/authentication_sets?categoryId={{category_id}}&brandId={{brand_id}}&modelId={{model_id}}', 200, 'Set authentication_set_id to response.id and turnaround_time_id to a selected turn_around_time_list[].id. Follow guideline and every required placeholder when taking photos. Optional service_placeholder_id must come from this set.', { pre: requireIntegers(catalogIds), test: has("typeof body.id === 'number' && Array.isArray(body.turn_around_time_list)", 'Authentication set includes its ID and turnaround options'), example: { id: 1, turn_around_time_list: [{ id: 1, title: 'Standard', subtitle: null, minute: 1440, credit: 2 }], guideline: [], placeholder: [] } }),
      ]),
      folder('03 - Server API submission', 'Reset images_json to [] for a new case. Repeat the upload request for each required view, then submit once.', [
        make('Upload initial photo', 'POST', '/asset_image', '/upload-image', 201, `Select a local image in Body > form-data > ${local ? 'image' : 'file'}. Repeat for every required view. URLs accumulate in images_json. Clear service_placeholder_id between uploads unless intentionally binding to the same placeholder. Local example limit: 10 MB.`, { upload: true, test: keepUpload(local, 'images_json'), example: local ? { image_url: 'https://example.com/image.jpg' } : { url: 'https://example.com/image.jpg' } }),
        make('Submit authentication', 'POST', '/authentication', '/submit-authentication', 201, 'Creates an authentication and saves authentication_id as a string. Set matching catalog IDs, choose a turnaround time and upload all required views first. Completion is asynchronous; use webhooks to track it.', { body: authenticationBody, pre: requireIntegers([...catalogIds, 'authentication_set_id', 'turnaround_time_id']) + requireImages('images_json'), test: keepId('authentication_id'), example: { authentication_id: sampleId, authentication_token: 2 }, invalid: true }),
      ]),
      folder('04 - Web Submission', 'Choose one intent example. Open the returned authentication_url in a browser and complete the hosted photo submission. An intent alone is not a submitted authentication.', [
        make('Create authentication intent', 'POST', '/authentication_intent', '/authentication-intents', 201, 'Creates an unrestricted hosted submission. Saves authentication_intent_id, authentication_url and the future authentication_id. language controls the hosted page. Open authentication_url manually; do not publish it.', { body: intentBody, test: intentTests, example: { authentication_intent_id: sampleId, authentication_url: 'https://submit-sandbox.legitapp.com/authentication/aitestEXAMPLE_NOT_REAL', expired_at: '2026-02-01T00:00:00.000Z' } }),
        make('Create restricted authentication intent', 'POST', '/authentication_intent', '/authentication-intents', 201, 'Alternative to the unrestricted request. Locks the category, brand and model; applies your custom code directly. Set tag_enabled=true only when physical-tag authentication is required and supported by the selected category.', { body: restrictedIntentBody, pre: requireIntegers(catalogIds), test: intentTests, example: { authentication_intent_id: sampleId, authentication_url: 'https://submit-sandbox.legitapp.com/authentication/aitestEXAMPLE_NOT_REAL', expired_at: '2026-02-01T00:00:00.000Z' }, invalid: true }),
      ]),
      folder('05 - Authentication details (Authentic or Replica)', 'The current detail endpoint returns same-account Authentic/Replica cases, including App submissions. Pending, Inconclusive, missing and other-account cases can return 404. Wait for completion before using it.', [
        make('Get authentication detail by ID', 'GET', '/authentication/{{authentication_id}}', '/authentications/{{authentication_id}}', 200, 'Use an Authentic/Replica authentication under this account. certificate_pdf_url can be null; reading this endpoint does not generate a PDF. certificate_url is optional and omitted in Sandbox. fake_rating applies to Replica only; higher means closer resemblance to authentic, not higher probability of authenticity.', { pre: requireFields(['authentication_id']), test: keepId('authentication_id'), example: detail, notFound: true }),
        make('Get authentication detail by tag', 'GET', '/authentication/tag/{{tag_id}}', '/authentications/tag/{{tag_id}}', 200, 'Requires a tag linked to an Authentic/Replica authentication under the same account. Saves the returned authentication_id.', { pre: requireFields(['tag_id']), test: keepId('authentication_id'), example: detail, notFound: true }),
        make('Get authentication detail by custom code', 'GET', '/authentication/user_custom_code/{{encoded_user_custom_code}}', '/authentications/user-custom-code/{{encoded_user_custom_code}}', 200, 'Requires your custom code on an Authentic/Replica authentication under the same account. The script URL-encodes the code. Saves authentication_id.', { pre: requireFields(['user_custom_code']), test: keepId('authentication_id'), example: detail, notFound: true }),
      ]),
      folder('06 - Conditional follow-up operations', 'Run individually when the prerequisites are met. A newly submitted case is not automatically eligible for any of these requests.', [
        make('Upload additional photo', 'POST', '/asset_image', '/upload-image', 201, `After an extra-photo request, reset additional_images_json to [], then select each requested image in Body > ${local ? 'image' : 'file'}. URLs accumulate separately from the initial photos.`, { upload: true, test: keepUpload(local, 'additional_images_json'), example: local ? { image_url: 'https://example.com/additional.jpg' } : { url: 'https://example.com/additional.jpg' } }),
        make('Submit requested additional photos', 'POST', '/authentication/{{authentication_id}}/photo', '/submit-additional-photos-for-authentication/{{authentication_id}}', 200, 'Requires a current extra-photo request for this authentication. Respond to the latest authentication.extra_photo event. The API does not accept text replies to checker messages.', { body: additionalBody, pre: requireFields(['authentication_id']) + requireImages('additional_images_json'), test: has('body.success === true', 'Additional photos accepted'), example: { success: true }, invalid: true }),
        make('Generate or reuse PDF certificate', 'POST', '/authentication/{{pdf_authentication_id}}/pdf_certificate', '/authentications/{{pdf_authentication_id}}/pdf_certificate', 200, 'Set pdf_authentication_id explicitly to a completed Authentic/Replica authentication owned by this account; App submissions qualify too. Reuses the existing current PDF; this endpoint is not a force-regeneration/renewal operation. Saves certificate_pdf_url.', { pre: requireFields(['pdf_authentication_id']), test: `${has("typeof body.certificate_pdf_url === 'string' && /^https?:\\/\\//.test(body.certificate_pdf_url)", 'Certificate response contains a PDF URL')}\nif (typeof body.certificate_pdf_url === 'string') pm.environment.set('certificate_pdf_url', body.certificate_pdf_url);`, example: { authentication_id: sampleId, certificate_pdf_url: 'https://example.com/certificate.pdf' }, invalid: true, notFound: true }),
        make('Cancel eligible authentication', 'PATCH', '/authentication/{{cancel_authentication_id}}/cancel', '/authentications/{{cancel_authentication_id}}/cancel', 200, 'Set cancel_authentication_id explicitly to an owned user_pending authentication with an outstanding extra-photo request within the cancellation window (30 days). App submissions qualify. Refund occurs once. Other states are rejected. This API does not emit authentication.cancelled; that event applies to administrator cancellation.', { pre: requireFields(['cancel_authentication_id']), test: has('body.success === true', 'Cancellation accepted'), example: { success: true }, invalid: true, notFound: true }),
      ]),
    ],
  };
  if (local) {
    collection.item.push(folder('07 - Local webhook simulations', 'These send fixtures directly to your example; they do not prove delivery from LegitApp, request photos, complete a case or update its status. Use the Developer Portal Sandbox Web Hook tests to verify real delivery.', eventTypes.map(type => {
      const fixture = {
        id: `evt_example_${type}`, object: 'event', 'api-version': 'v1',
        created_at: '2026-01-01 00:00:00', livemode: false,
        type: `authentication.${type}`,
        data: { event_type: `authentication.${type}`, authentication_id: sampleId, user_custom_code: 'postman-demo' },
      };
      if (type === 'new_message') fixture.data.content = 'Please take another photo with the flashlight on.';
      if (type === 'extra_photo') fixture.data.placeholder = [{ title: 'Requested view', description: 'Photograph the requested detail clearly.' }];
      if (type === 'completed') fixture.data.result = 'authentic';
      save(`postman/fixtures/${type}.json`, fixture);
      const item = make(`Simulate authentication.${type}`, 'POST', '', '{{webhook_path}}', 200, 'Local fixture only. Set webhook_path to /webhook or /webhook/<your-private-token> to match the example configuration. Default handlers log event metadata; replace them with your application logic.', { body: JSON.stringify(fixture, null, 2), test: has('body.received === true', 'Webhook acknowledged'), example: { received: true, event_type: fixture.type } });
      item.request.url = `${base}{{webhook_path}}`;
      item.response = item.response.filter(response => response.code === 200);
      return item;
    })));
  }
  save(local ? 'postman/LegitApp-Local-Example.postman_collection.json' : 'postman/LegitApp-Developer-API.postman_collection.json', collection);
}

for (const [name, target, url] of [['Sandbox', 'sandbox', sandbox], ['Production', 'production', production], ['Local-Example', 'local-example', 'http://127.0.0.1:3000']]) {
  const values = { target, ...(target === 'local-example' ? { example_base_url: url, webhook_path: '/webhook' } : { api_base_url: url, developer_secret: '' }),
    language: 'en', category_id: '', brand_id: '', model_id: '', authentication_set_id: '', turnaround_time_id: '',
    service_placeholder_id: '', image_url: '', images_json: '[]', additional_images_json: '[]',
    authentication_id: '', pdf_authentication_id: '', cancel_authentication_id: '', tag_id: '',
    user_custom_code: 'postman-demo', user_remark: '', authentication_intent_id: '', authentication_url: '', certificate_pdf_url: '',
  };
  save(`postman/environments/${name}.postman_environment.json`, {
    name: `LegitApp - ${name.replaceAll('-', ' ')}`,
    values: Object.entries(values).map(([key, value]) => ({ key, value, type: ['developer_secret', 'authentication_url', 'webhook_path'].includes(key) ? 'secret' : 'default', enabled: true })),
    _postman_variable_scope: 'environment',
  });
}
for (const [name, content] of files) {
  const filename = path.join(root, name);
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(filename, 'utf8'), content, `Regenerate ${name} with npm run postman:build`);
  else { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content); }
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Generated'} ${files.size} Postman files.`);
