# WhatsApp API Integration

A WhatsApp integration using Node.js and the whatsapp-web.js library.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the application:
```bash
npm start
```

3. When the application starts, it will generate a QR code in the terminal. Scan this QR code with WhatsApp on your phone to link the application.

## Features

- Send and receive WhatsApp messages
- Automatic message handling
- REST API endpoint for sending messages
- QR code-based authentication

## API Usage

### Send Message
Send a POST request to `/send-message` with the following JSON body:
```json
{
    "number": "1234567890",  // Phone number with country code
    "message": "Hello from WhatsApp API!"
}
```

## Development

For development with auto-reload:
```bash
npm run dev
```

## Requirements

- Node.js 14 or higher
- WhatsApp installed on your phone
- A phone number to use as the WhatsApp bot

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- The QR code should be scanned only by authorized personnel
- Use HTTPS in production environments # whats-app-api
