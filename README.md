# LegitApp Developer API integration examples

Try the LegitApp Developer API directly with Postman, or run the TypeScript/Express example to see API calls and webhook handling in an application. Both Server API and Web Submission workflows are included.

- [Server API guide](https://docs.legitapp.com/)
- [Web Submission guide](https://docs.legitapp.com/web-submission/overview)
- [Postman testing instructions](postman/README.md)

## Try the API directly with Postman

1. Download/import [LegitApp Developer API collection](postman/LegitApp-Developer-API.postman_collection.json).
2. Download/import the [Sandbox environment](postman/environments/Sandbox.postman_environment.json) and select **LegitApp - Sandbox**.
3. Enter your Sandbox developer secret locally as `developer_secret`.
4. Send **Get token balance**, then follow the numbered folders and [walkthrough](postman/README.md).

On GitHub, open a JSON file and choose **Download raw file** to save an importable copy. This collection calls the documented API directly and requires no local server. Use a current Postman version supporting `pm.execution.skipRequest()`.

The collection defaults to Sandbox. When ready to use live authentications, import/select the separate [Production environment](postman/environments/Production.postman_environment.json) and enter its matching developer secret. Every environment keeps its own catalog selections, image buffers and case IDs. Shared files contain no developer credentials.

| Environment | API base URL |
| --- | --- |
| Sandbox | `https://developer-api-a7zu.legitapp.com/v1` |
| Production | `https://developer-api.legitapp.com/v1` |

The [local example collection](postman/LegitApp-Local-Example.postman_collection.json) is separate: its routes call the example application described below.

## Run the TypeScript example

Use Node.js 22 or 24 and npm. The test suite uses Node's built-in test runner and Newman. npm is the documented installation path; a synchronized Yarn 1 lockfile is retained for existing users.

```bash
git clone https://github.com/legitappcom/legitapp-developer-api-example.git
cd legitapp-developer-api-example
npm ci
cp .env.example .env
```

Edit `.env` and set `LEGIT_APP_DEVELOPER_SECRET_KEY` to your Sandbox developer secret. The variable name matches the implementation. `LEGIT_APP_API_URL` defaults to the Sandbox URL **including `/v1`**.

```bash
npm run dev
```

The server listens at `http://127.0.0.1:3000`. Open `/health` to check that it is running. Missing credentials, invalid API URLs, invalid ports and malformed private webhook tokens fail at startup with a configuration message.

Import the [Local Example environment](postman/environments/Local-Example.postman_environment.json), select it, and use the [local collection](postman/LegitApp-Local-Example.postman_collection.json). The upstream API URL and credential come from the server's `.env`; the collection itself does not need your developer secret.

To build and run compiled JavaScript:

```bash
npm run build
npm start
```

## Integration workflows

### Server API

Browse categories, brands and models, select an authentication set and turnaround time, upload each required photo, then submit an authentication. Read the set's guidelines and required placeholders before uploading.

The submission body uses `authentication_set_id`, `turnaround_time_id` and `images`. Type definitions in [src/types.ts](src/types.ts) follow the current API. Authentication IDs remain strings, including leading zeros.

Completion is asynchronous. Receive checker messages, additional-photo requests and results through webhooks. After a current additional-photo request, upload the requested views and submit them using the additional-photo endpoint. There is no text-reply API.

### Web Submission

Create an authentication intent and open the returned `authentication_url` in a browser. The customer submits their photos on the hosted page. An intent alone is not a completed photo submission.

An unrestricted and a restricted intent example are included. Restrictions can specify category, brand, model, physical tag requirements and custom code requirements. The `language` body field controls the hosted page language. Keep hosted submission URLs private.

The returned `authentication_intent_id` becomes the authentication ID after successful initial submission. Submission and completion webhooks describe the later lifecycle. No GET-intent/status endpoint is invented by this example.

### Authentication details, PDFs and cancellation

- **Details:** current API lookups return same-account Authentic/Replica cases, including App submissions. Pending, Inconclusive or unavailable cases can return `404`. Look up by authentication ID, tag ID or custom code.
- **PDF:** use a completed Authentic/Replica authentication owned by the same account, including an App submission. Generate the PDF or reuse the existing current PDF. This endpoint does not force renewal/regeneration. Reading details does not generate a PDF, so `certificate_pdf_url` can be null.
- **Certificate webpage:** `certificate_url` is distinct from the PDF URL. It is optional and is included for Authentic/Replica results in Production; Sandbox omits it.
- **Cancellation:** the case must be `user_pending`, owned by the account, and have an outstanding additional-photo request within the 30-day cancellation window. Eligible App submissions qualify too. The refund occurs once. API cancellation does not emit `authentication.cancelled`; that event applies to administrator cancellation.

The collection uses explicit `pdf_authentication_id` and `cancel_authentication_id` variables for those conditional operations. It does not assume that a newly submitted case is eligible.

## Local routes

| Method | Example route | Developer API route |
| --- | --- | --- |
| GET | `/categories` | `/product_category` |
| GET | `/brands?categoryId=…` | `/product_brand?category_id=…` |
| GET | `/models?categoryId=…&brandId=…` | `/product_model?category_id=…&brand_id=…` |
| GET | `/authentication_sets?categoryId=…&brandId=…&modelId=…` | `/authentication_set?category_id=…&brand_id=…&model_id=…` |
| GET | `/token-balance` | `/token_balance` |
| POST | `/upload-image` | `/asset_image` |
| POST | `/submit-authentication` | `/authentication` |
| POST | `/submit-additional-photos-for-authentication/:authenticationId` | `/authentication/:id/photo` |
| GET | `/authentications/:authenticationId` | `/authentication/:id` |
| GET | `/authentications/tag/:tagId` | `/authentication/tag/:tagId` |
| GET | `/authentications/user-custom-code/:code` | `/authentication/user_custom_code/:code` |
| POST | `/authentications/:authenticationId/pdf_certificate` | `/authentication/:id/pdf_certificate` |
| PATCH | `/authentications/:authenticationId/cancel` | `/authentication/:id/cancel` |
| POST | `/authentication-intents` | `/authentication_intent` |
| POST | `/webhook` or configured private path | Receives events; not a Developer API endpoint |

Direct API uploads use multipart field **file**. Local uploads use **image**; the example translates it and returns `{ "image_url": "…" }`. The local example accepts files up to 10 MB.

The proxy preserves upstream success statuses, including `201 Created`, and structured `errors` responses. Transport failures return a generic `502`, and timeouts return `504`. Outbound API calls have a 90-second timeout to accommodate PDF generation and do not follow redirects. Request credentials and arbitrary upstream error bodies are not returned to the caller.

## Webhooks

The [switch statement in src/app.ts](src/app.ts) handles the six events used by the guides:

- `authentication.cancelled`
- `authentication.initial_photo_submission`
- `authentication.new_message`
- `authentication.extra_photo`
- `authentication.extra_photo_submission`
- `authentication.completed`

The previous `authentication.result_updated` case is removed: it is not an active documented event; the corresponding Core API emitter is commented out. Unknown event types are acknowledged without processing.

Each case awaits its handler before returning HTTP `200`. A thrown handler error returns `500` so a delivery can be retried. The default handlers **only log event metadata**. Replace them with your application logic and durably track `event.id` plus processing state to handle duplicate deliveries and retries. No in-memory deduplication is presented as a production guarantee.

Use the six [JSON fixtures](postman/fixtures) or the local collection's **Local webhook simulations** folder to test routing. These requests do not prove actual delivery from LegitApp and do not change authentication state.

For actual delivery:

1. Expose only the webhook path through a reachable reverse proxy/tunnel, keeping the example's API proxy routes private because they use your server-side developer secret.
2. Use HTTPS in Production. Sandbox also allows HTTP.
3. Optionally generate a private path token with `openssl rand -hex 32`, put it in `WEBHOOK_PATH_TOKEN`, and register `https://your-domain.example/webhook/<token>`. Keep that URL private.
4. Register the endpoint in the matching environment in the Developer Portal. Each environment has one configured webhook destination.
5. Use the Portal's Sandbox webhook tests and inspect delivery status. For Web Submission, also complete the hosted flow to verify submission events.

LegitApp currently does not sign webhook requests or include a dedicated verification header. JSON validation does not authenticate the sender. Follow the guides' IP allowlisting and private URL recommendations. This sample does not claim to verify a signature.

## Development and verification

```bash
npm test
npm run postman:build
npm run postman:check
```

`npm test` compiles TypeScript, verifies that generated Postman files match their source, tests the HTTP proxy/webhook behavior, and runs both collections through Newman using temporary loopback mock servers and placeholder credentials. It does not call Sandbox or Production, upload to real storage, generate a real PDF or spend account tokens. Live API and Portal delivery checks remain part of integration verification.

Both collections, all three environments and webhook fixtures are maintained by [scripts/build-postman.cjs](scripts/build-postman.cjs). Change that source and regenerate the checked-in exports. Refer to the [review notes](docs/review-notes.md) for the before/after comparison and to [shared guide wording](docs/integration-examples.md) when updating the two documentation pages after merge.

## Project structure

```text
src/server.ts                Environment validation and server startup
src/app.ts                   API proxy routes and webhook switch
src/types.ts                 Current request and webhook types
postman/                     Direct/local collections, environments and fixtures
scripts/build-postman.cjs    Maintained source for the Postman exports
test/                        HTTP integration and Newman tests
```
