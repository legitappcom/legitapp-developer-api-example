import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

dotenv.config();

const app = express();
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Types
interface AuthenticationRequest {
  brand_id: number;
  category_id: number;
  model_id: number;
  product_sku?: string;
  product_sku_id?: number;
  service_level_id: number;
  service_extra_service_ids?: number[];
  images: {
    image_url: string;
    source?: string;
    publishable?: boolean;
    system_image_remark?: string;
    user_image_remark?: string;
  }[];
  product_source_type?: string;
  product_source_remark?: string;
  product_source_currency?: string;
  product_source_price?: string;
  user_custom_code?: string;
  user_remark?: string;
  certificate_owner_name?: string;
}

interface AuthenticationAdditionalPhotosParams {
  images: {
    image_url: string;
    source?: string;
    publishable?: boolean;
    system_image_remark?: string;
    user_image_remark?: string;
  }[];
  user_remark?: string;
}

// API Configuration
const LEGIT_APP_API = {
  baseURL: process.env.LEGIT_APP_API_URL,
  developerSecretKey: process.env.LEGIT_APP_DEVELOPER_SECRET_KEY,
  headers: {
    'Authorization': `Bearer ${process.env.LEGIT_APP_DEVELOPER_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
};

// API Routes
// Get categories api example
app.get('/categories', async (req, res) => {
  try {
    const response = await axios.get(
      `${LEGIT_APP_API.baseURL}/product_category`,
      { headers: LEGIT_APP_API.headers }
    );
    res.json(response.data);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit authentication request';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Get brands api example
app.get('/brands', async (req, res) => {
  try {
    const response = await axios.get(
      `${LEGIT_APP_API.baseURL}/product_brand?category_id=${req.query.categoryId}`,
      { headers: LEGIT_APP_API.headers },
    );
    res.json(response.data);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit authentication request';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Get models api example
app.get('/models', async (req, res) => {
  try {
    const response = await axios.get(
      `${LEGIT_APP_API.baseURL}/product_model?category_id=${req.query.categoryId}&brand_id=${req.query.brandId}`,
      { headers: LEGIT_APP_API.headers }
    );
    res.json(response.data);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit authentication request';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Get authentication sets api example
app.get('/authentication_sets', async (req, res) => {
  try {
    const response = await axios.get(
      `${LEGIT_APP_API.baseURL}/authentication_set?category_id=${req.query.categoryId}&brand_id=${req.query.brandId}&model_id=${req.query.modelId}`,
      { headers: LEGIT_APP_API.headers }
    );
    res.json(response.data);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit authentication request';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Upload image api example
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Create a readable stream from the buffer
    const stream = Readable.from(req.file.buffer);

    // Create form data with the image using form-data package
    const formData = new FormData();
    formData.append('file', stream, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const response = await axios.post(
      `${LEGIT_APP_API.baseURL}/asset_image`,
      formData,
      {
        headers: {
          ...LEGIT_APP_API.headers,
          ...formData.getHeaders()
        }
      }
    );

    res.json({ image_url: response.data.url });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit authentication request';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Submit authentication api example
app.post('/submit-authentication', async (req, res) => {
  try {
    const authenticationRequestParams: AuthenticationRequest = req.body;
    const response = await axios.post(
      `${LEGIT_APP_API.baseURL}/authentication`,
      authenticationRequestParams,
      { headers: LEGIT_APP_API.headers }
    );

    res.json(response.data);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit authentication request';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});


// Submit additional photos for authentication api example
app.post('/submit-additional-photos-for-authentication/:authenticationId', async (req, res) => {
  try {
    const authenticationAdditionalPhotosParams: AuthenticationAdditionalPhotosParams = req.body;
    const response = await axios.post(
      `${LEGIT_APP_API.baseURL}/authentication/${req.params.authenticationId}/photo`,
      authenticationAdditionalPhotosParams,
      { headers: LEGIT_APP_API.headers }
    );

    res.json(response.data);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Failed to submit additional photos for authentication';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});


// Webhook api example
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const eventType = event.type;
    // Handle the event
    switch (event.type) {
      case 'authentication.extra_photo':
        const authenticationExtraPhotoData = event.data;
        console.log('this is extra photo event');
        // Then define and call a method to handle the authentication extra photo request.
        // handleAuthenticationExtraPhotoRequest(authenticationExtraPhotoData);
        break;
      case 'authentication.new_message':
        const authenticationNewMessageData = event.data;
        console.log('this is authentication new message event');
        // Then define and call a method to handle the successful attachment of a PaymentMethod.
        // handleAuthenticationNewMessage(authenticationNewMessageData);
        break;
      case 'authentication.completed':
        const authenticationCompletedData = event.data;
        console.log('this is authentication completed event');
        // Then define and call a method to handle the successful attachment of a PaymentMethod.
        // handleAuthenticationCompleted(authenticationCompletedData);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.json({ received: true, event_type: eventType });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      'Webhook error';

    res.status(error.response?.status || 500).json({
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});