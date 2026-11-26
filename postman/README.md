# Postman testing guide

Start with the **LegitApp Developer API** collection and **Sandbox** environment. This collection calls LegitApp directly; no example server is needed.

## Import and configure

1. Import [LegitApp-Developer-API.postman_collection.json](LegitApp-Developer-API.postman_collection.json).
2. Import [Sandbox.postman_environment.json](environments/Sandbox.postman_environment.json) and select **LegitApp - Sandbox**.
3. Enter your Sandbox developer secret in the environment's `developer_secret` variable. Keep the value local/private; leave exported or shared credentials blank.
4. Send **01 - Account / Get token balance** to check the connection.
5. Follow the Server API or Web Submission workflow below. Send requests individually; conditional follow-up requests require an eligible case.

Use a current Postman version supporting `pm.execution.skipRequest()` in pre-request scripts. The scripts identify missing settings and skip requests with an incompatible environment or missing prerequisites. Newman is included for automated local mock testing through `npm test`.

| Environment | API base URL | Credential |
| --- | --- | --- |
| Sandbox (start here) | `https://developer-api-a7zu.legitapp.com/v1` | Your Sandbox developer secret |
| Production | `https://developer-api.legitapp.com/v1` | Your Production developer secret |

To use Production, import [Production.postman_environment.json](environments/Production.postman_environment.json), select it and enter its own secret. Saved case IDs, image buffers and URLs belong to the selected environment. Production requests operate on live authentications and account tokens. Exported environments contain blank credentials and blank authentication IDs.

The direct collection's fallback base URL is Sandbox. Selecting an environment chooses its corresponding URL and credentials. The local collection is separate because its routes and multipart field name differ.

## Server API workflow

1. **Find categories**: choose an entry from `data` and set `category_id`.
2. **Find brands**: choose a brand for that category and set `brand_id`.
3. **Find models**: choose a model and set `model_id`.
4. **Get authentication set**: set `authentication_set_id` to response `id`, and `turnaround_time_id` to your selected `turn_around_time_list[].id`. Review `guideline` and each required `placeholder`. IDs and availability can differ between environments; no catalog entry is selected automatically.
5. Reset `images_json` to `[]`. In **Upload initial photo**, select a file under **Body > form-data > file**. Repeat for every required view. Each successful upload appends an image object to `images_json` and saves its URL as `image_url`.
6. Optionally set `service_placeholder_id` before an upload to bind that image to a placeholder from this set. Leave it blank unless the field is supported/enabled for your integration. Clear or change it for the next view. The identifier is attached to the image object; it is not an upload API parameter.
7. Set your optional `user_custom_code` and `user_remark`, then send **Submit authentication** once. The script saves the returned `authentication_id` as a string, preserving leading zeros. Use `authentication_set_id` and `turnaround_time_id` for the selected authentication set and turnaround time.
8. Completion is asynchronous. Configure webhooks in the Developer Portal to receive messages, additional-photo requests and results. Run detail/PDF requests only when their prerequisites apply.

For another case, reset `images_json` and `additional_images_json` to `[]` and choose its matching catalog selections. Scripts save state in the selected environment, not in shared collection variables.

## Web Submission workflow

1. Choose **Create authentication intent**, or use **Create restricted authentication intent** when the customer must use a selected category, brand and model. The restricted example requires your catalog IDs.
2. The scripts save `authentication_intent_id`, `authentication_url` and the future `authentication_id`. Treat the returned hosted URL as private. These values can be overwritten by another intent request.
3. Open `authentication_url` in a browser and complete the hosted photo submission. Creating the intent alone does not submit photos or create a completed authentication. The intent ID becomes the authentication ID after successful submission.
4. Use `language` to select the hosted page language. Optional `tag_enabled` requires physical-tag authentication where supported; `user_custom_code_enabled` requires a custom code, while `user_custom_code` applies it directly.
5. Receive the submission and result webhooks on your registered endpoint. The Developer API detail/PDF endpoints can then access eligible same-account authentications.

Use webhook events to track the submission and authentication lifecycle.

## Details and conditional operations

| Request | Prerequisite and behavior |
| --- | --- |
| Get authentication detail | Current API lookups return same-account Authentic or Replica cases, including App submissions. Pending, Inconclusive, disabled, missing or other-account cases can return `404`. Supported lookups are by authentication ID, tag ID or URL-encoded custom code. |
| Upload/submit additional photos | Wait for a current `authentication.extra_photo` request. Reset `additional_images_json` to `[]`, upload every requested view, then submit them for `authentication_id`. This buffer is separate from initial photos. Checker messages are read-only; no text-reply endpoint is demonstrated. |
| Generate or reuse PDF | Set `pdf_authentication_id` explicitly to a completed Authentic/Replica case owned by the account. App submissions qualify too. This request reuses the current PDF; it does not force regeneration. It saves `certificate_pdf_url`. |
| Cancel authentication | Set `cancel_authentication_id` explicitly to an owned `user_pending` case with an outstanding extra-photo request within the 30-day cancellation window. App submissions qualify too. The cancellation refunds once; other states are rejected. API cancellation does not emit `authentication.cancelled`, which applies to administrator cancellation. |

`certificate_pdf_url` can be null until a PDF is generated. Reading authentication details does not generate it. `certificate_url` is a separate public certificate webpage URL, available for Authentic/Replica results in Production and omitted in Sandbox. `fake_rating` applies to Replica results; a higher value means closer resemblance to an authentic item, not a probability that the item is authentic.

## Test the local example

1. Follow the [server setup](../README.md#run-the-typescript-example).
2. Import [LegitApp-Local-Example.postman_collection.json](LegitApp-Local-Example.postman_collection.json) and [Local-Example.postman_environment.json](environments/Local-Example.postman_environment.json).
3. Select **LegitApp - Local Example**. Its `example_base_url` defaults to `http://127.0.0.1:3000`. The server's `.env` chooses the upstream API URL and secret; the local Postman environment does not carry that credential.
4. Repeat the workflows above. The local upload field is **image**. The example converts it to the upstream **file** field, preserves `201 Created`, and returns `{ "image_url": "..." }`.
5. Use **07 - Local webhook simulations** to POST any of the six fixtures directly to the example. Set `webhook_path` to `/webhook`, or `/webhook/<your-token>` when `WEBHOOK_PATH_TOKEN` is configured. Keep a private path token local/private too.

Local webhook simulation only tests your handler. It does not verify that LegitApp can reach your endpoint, request photos, complete a case or change its state. To verify actual delivery, register a reachable endpoint in the Developer Portal and use its Sandbox webhook testing tools. Web Submission submission events can also be verified by completing the hosted flow.

## Responses and maintenance

Saved responses are illustrative, with synthetic IDs and `example.com` URLs. Actual IDs, availability, optional fields, errors and translated messages come from the selected environment. Every request includes its expected success status, response checks and prerequisites; failures remain visible in the test results and response body.

The JSON exports and webhook fixtures are generated from [build-postman.cjs](../scripts/build-postman.cjs). After changing an endpoint example, run:

```bash
npm run postman:build
npm test
```

Both collections are exercised by Newman against temporary loopback mock servers in the test suite. No developer credentials or live LegitApp requests are required for those tests.
