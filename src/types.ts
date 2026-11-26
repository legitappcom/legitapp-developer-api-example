export interface AuthenticationImage {
  image_url: string;
  source?: 'album' | 'camera';
  system_image_remark?: string | null;
  user_image_remark?: string | null;
  service_placeholder_id?: number | null;
}

export interface AuthenticationRequest {
  authentication_set_id: number;
  category_id: number;
  brand_id: number;
  model_id: number;
  turnaround_time_id: number;
  images: AuthenticationImage[];
  tag_id?: string | null;
  user_custom_code?: string | null;
  user_remark?: string | null;
}

export interface AdditionalPhotosRequest {
  images: AuthenticationImage[];
  user_remark?: string | null;
}

export interface AuthenticationIntentRequest {
  category_id?: number | null;
  brand_id?: number | null;
  model_id?: number | null;
  tag_enabled?: boolean;
  user_custom_code_enabled?: boolean;
  user_custom_code?: string | null;
  language?: string | null;
}

export const webhookEventTypes = [
  'authentication.cancelled',
  'authentication.initial_photo_submission',
  'authentication.new_message',
  'authentication.extra_photo',
  'authentication.extra_photo_submission',
  'authentication.completed',
] as const;

export type WebhookEventType = typeof webhookEventTypes[number];

export interface WebhookEvent {
  id: string;
  type: string;
  data: {
    authentication_id?: string;
    user_custom_code?: string | null;
    content?: string;
    result?: 'authentic' | 'replica' | 'inconclusive';
    certificate_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
