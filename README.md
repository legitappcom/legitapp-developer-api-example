# Legit App API Integration Example

This is a Node.js/TypeScript application demonstrating API integration with file upload capabilities.

## Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn package manager
- TypeScript knowledge (basic)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/legitapp/legitapp-developer-api-sample.git
cd legit-app-api-integration-example
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your environment variables:
```bash
# Example .env file
LEGIT_APP_API_URL=https://developer-api.legitapp.com/v1
LEGIT_APP_API_KEY=your_api_key
PORT=3000
# Add other required environment variables
```

## Development

To run the application in development mode with hot-reload:

```bash
npm run dev
```

## Building for Production

1. Build the TypeScript code:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

## Available Scripts

- `npm start` - Runs the compiled application
- `npm run dev` - Runs the application in development mode with hot-reload
- `npm run build` - Compiles TypeScript to JavaScript
- `npm run watch` - Watches for TypeScript changes and recompiles

## Project Structure

```
src/
  ├── server.ts      # Main application entry point
  └── ...           # Other source files
dist/               # Compiled JavaScript files
```

## Dependencies

- Express - Web framework
- Axios - HTTP client
- Multer - File upload middleware
- dotenv - Environment variable management
- TypeScript - Programming language

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
