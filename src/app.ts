import express, { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import {
  AuthenticationRequest, AdditionalPhotosRequest, AuthenticationIntentRequest,
  WebhookEvent, WebhookEventType,
} from './types';

export interface AppConfig {
  apiBaseUrl: string;
  developerSecretKey: string;
  webhookPath?: string;
  timeoutMs?: number;
}

export type EventHandler = (event: WebhookEvent) => void | Promise<void>;
export type EventHandlers = Partial<Record<WebhookEventType, EventHandler>>;

// Demonstration only: replace these handlers with your application logic.
// In production, persist event.id and processing state durably to handle retries.
const logEvent: EventHandler = (event) => {
  console.log('Received webhook', {
    id: event.id, type: event.type, authentication_id: event.data.authentication_id,
  });
};

export function createApp(config: AppConfig, handlers: EventHandlers = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const api = axios.create({
    baseURL: config.apiBaseUrl.replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${config.developerSecretKey}` },
    timeout: config.timeoutMs ?? 90000,
    maxRedirects: 0,
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  const route = (handle: (req: Request, res: Response) => Promise<unknown>) => (
    req: Request, res: Response, next: NextFunction,
  ) => { Promise.resolve(handle(req, res)).catch(next); };
  const send = (res: Response, response: { status: number; data: unknown }) => (
    res.status(response.status).json(response.data)
  );
  const locale = (req: Request) => ({ headers: { 'Accept-Language': req.get('Accept-Language') || 'en' } });
  const query = (req: Request, keys: Record<string, string>) => Object.fromEntries(
    Object.entries(keys).map(([local, remote]) => [remote, req.query[local]])
      .filter(([, value]) => typeof value === 'string' && value !== ''),
  );
  const id = (value: string) => encodeURIComponent(value);

  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/categories', route(async (req, res) => send(res, await api.get('/product_category', locale(req)))));
  app.get('/brands', route(async (req, res) => send(res, await api.get('/product_brand', {
    ...locale(req), params: query(req, { categoryId: 'category_id' }),
  }))));
  app.get('/models', route(async (req, res) => send(res, await api.get('/product_model', {
    ...locale(req), params: query(req, { categoryId: 'category_id', brandId: 'brand_id' }),
  }))));
  app.get('/authentication_sets', route(async (req, res) => send(res, await api.get('/authentication_set', {
    ...locale(req), params: query(req, { categoryId: 'category_id', brandId: 'brand_id', modelId: 'model_id' }),
  }))));
  app.get('/token-balance', route(async (req, res) => send(res, await api.get('/token_balance', locale(req)))));

  // Local multipart field: image. LegitApp multipart field: file.
  app.post('/upload-image', upload.single('image'), route(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ errors: [{ id: 'IMAGE_REQUIRED', message: 'Select an image file.', code: 400 }] });
    }
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    const response = await api.post('/asset_image', form, { headers: { ...locale(req).headers, ...form.getHeaders() } });
    return res.status(response.status).json({ image_url: response.data.url });
  }));

  app.post('/submit-authentication', route(async (req, res) => {
    const body: AuthenticationRequest = req.body;
    return send(res, await api.post('/authentication', body, locale(req)));
  }));
  app.post('/submit-additional-photos-for-authentication/:authenticationId', route(async (req, res) => {
    const body: AdditionalPhotosRequest = req.body;
    return send(res, await api.post(`/authentication/${id(req.params.authenticationId)}/photo`, body, locale(req)));
  }));
  app.get('/authentications/tag/:tagId', route(async (req, res) => (
    send(res, await api.get(`/authentication/tag/${id(req.params.tagId)}`, locale(req)))
  )));
  app.get('/authentications/user-custom-code/:code', route(async (req, res) => (
    send(res, await api.get(`/authentication/user_custom_code/${id(req.params.code)}`, locale(req)))
  )));
  app.get('/authentications/:authenticationId', route(async (req, res) => (
    send(res, await api.get(`/authentication/${id(req.params.authenticationId)}`, locale(req)))
  )));
  app.post('/authentications/:authenticationId/pdf_certificate', route(async (req, res) => (
    send(res, await api.post(`/authentication/${id(req.params.authenticationId)}/pdf_certificate`, undefined, locale(req)))
  )));
  app.patch('/authentications/:authenticationId/cancel', route(async (req, res) => (
    send(res, await api.patch(`/authentication/${id(req.params.authenticationId)}/cancel`, undefined, locale(req)))
  )));
  app.post('/authentication-intents', route(async (req, res) => {
    const body: AuthenticationIntentRequest = req.body;
    return send(res, await api.post('/authentication_intent', body, locale(req)));
  }));

  app.post(config.webhookPath ?? '/webhook', route(async (req, res) => {
    const event: WebhookEvent = req.body;
    if (!event || typeof event.id !== 'string' || !event.id || typeof event.type !== 'string'
      || !event.type || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
      return res.status(400).json({ errors: [{ id: 'INVALID_EVENT', message: 'Provide event.id, event.type and event.data.', code: 400 }] });
    }
    // Finish accepting/handling the event before acknowledging it. A handler failure
    // reaches the error middleware and returns 500, allowing LegitApp to retry.
    switch (event.type) {
      case 'authentication.cancelled':
        await (handlers['authentication.cancelled'] ?? logEvent)(event);
        break;
      case 'authentication.initial_photo_submission':
        await (handlers['authentication.initial_photo_submission'] ?? logEvent)(event);
        break;
      case 'authentication.new_message':
        await (handlers['authentication.new_message'] ?? logEvent)(event);
        break;
      case 'authentication.extra_photo':
        await (handlers['authentication.extra_photo'] ?? logEvent)(event);
        break;
      case 'authentication.extra_photo_submission':
        await (handlers['authentication.extra_photo_submission'] ?? logEvent)(event);
        break;
      case 'authentication.completed':
        await (handlers['authentication.completed'] ?? logEvent)(event);
        break;
      default:
        console.log('Unhandled webhook type', event.type);
    }
    return res.status(200).json({ received: true, event_type: event.type });
  }));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (axios.isAxiosError(error)) {
      const upstream = error.response;
      if (upstream && Array.isArray(upstream.data?.errors)) {
        res.status(upstream.status).json(upstream.data);
        return;
      }
      const status = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' ? 504 : 502;
      res.status(status).json({ errors: [{ id: 'UPSTREAM_ERROR', message: 'The LegitApp API request failed.', code: status }] });
      return;
    }
    const status = error instanceof multer.MulterError ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ errors: [{
      id: 'EXAMPLE_ERROR',
      message: status === 413 ? 'The local example accepts files up to 10 MB.'
        : status === 400 ? 'The request body or upload is invalid.' : 'The example could not process the request.',
      code: status,
    }] });
  };
  app.use(errorHandler);
  return app;
}
