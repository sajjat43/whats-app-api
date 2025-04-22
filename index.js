require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Store message history
let messageHistory = [];

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

// Generate QR Code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR Code generated. Please scan with WhatsApp on your phone.');
});

// When client is ready
client.on('ready', () => {
    console.log('Client is ready!');
});

// Handle client authentication
client.on('authenticated', () => {
    console.log('Client authenticated');
});

// Handle authentication failure
client.on('auth_failure', msg => {
    console.error('Authentication failed:', msg);
});

// Handle client disconnection
client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);
});

// Handle incoming messages
client.on('message', async (message) => {
    console.log(`Received message from ${message.from}: ${message.body}`);
    
    // Add to message history
    messageHistory.unshift({
        timestamp: new Date().toISOString(),
        from: message.from,
        body: message.body,
        status: 'Received'
    });
    
    // Save message history to file (optional)
    try {
        const fs = require('fs');
        fs.writeFileSync('messageHistory.json', JSON.stringify(messageHistory, null, 2));
    } catch (error) {
        console.error('Error saving message history:', error);
    }
});

// Load message history from file on startup
try {
    const fs = require('fs');
    if (fs.existsSync('messageHistory.json')) {
        messageHistory = JSON.parse(fs.readFileSync('messageHistory.json', 'utf8'));
        console.log('Loaded message history from file');
    }
} catch (error) {
    console.error('Error loading message history:', error);
}

// Initialize client
client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
});

// API endpoints
app.get('/status', (req, res) => {
    res.json({
        status: client.info ? 'ready' : 'not_ready',
        authenticated: client.info ? true : false
    });
});

// Get messages by number
app.get('/messages/:number', (req, res) => {
    try {
        const { number } = req.params;
        console.log('Received request for number:', number);
        
        if (!number) {
            return res.status(400).json({ error: 'Phone number is required' });
        }
        
        // Format the number to match the stored format
        let formattedNumber = number.replace(/\D/g, '');
        if (!formattedNumber.startsWith('880')) {
            formattedNumber = '880' + formattedNumber;
        }
        formattedNumber = formattedNumber + '@c.us';
        
        console.log('Formatted number:', formattedNumber);
        console.log('Current message history:', messageHistory);
        
        // Get all messages for this number (both sent and received)
        const messages = messageHistory.filter(msg => {
            const msgNumber = msg.from.replace('@c.us', '');
            const searchNumber = formattedNumber.replace('@c.us', '');
            return msgNumber === searchNumber;
        }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        console.log('Filtered messages:', messages);
        
        // Group messages by date
        const groupedMessages = {};
        messages.forEach(message => {
            const date = new Date(message.timestamp).toLocaleDateString();
            if (!groupedMessages[date]) {
                groupedMessages[date] = [];
            }
            groupedMessages[date].push(message);
        });
        
        res.json({
            number: formattedNumber.replace('@c.us', ''),
            totalMessages: messages.length,
            messages: groupedMessages
        });
    } catch (error) {
        console.error('Error getting messages by number:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message
app.post('/send-message', async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({ error: 'Number and message are required' });
        }

        // Format phone number correctly
        let formattedNumber = number;
        
        // Remove any non-digit characters
        formattedNumber = formattedNumber.replace(/\D/g, '');
        
        // Remove leading zeros if present
        formattedNumber = formattedNumber.replace(/^0+/, '');
        
        // Add country code if not present
        if (!formattedNumber.startsWith('880')) {
            formattedNumber = '880' + formattedNumber;
        }
        
        // Add @c.us suffix
        formattedNumber = formattedNumber + '@c.us';
        
        console.log('Attempting to send message to:', formattedNumber);
        
        // Check if client is ready
        if (!client.info) {
            return res.status(503).json({ error: 'WhatsApp client is not ready. Please scan QR code first.' });
        }

        // Send message
        const result = await client.sendMessage(formattedNumber, message);
        console.log('Message sent successfully:', result);
        
        // Add to message history
        messageHistory.unshift({
            timestamp: new Date().toISOString(),
            from: formattedNumber,
            body: message,
            status: 'Sent',
            messageId: result.id
        });
        
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            messageId: result.id
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message 
        });
    }
});

// Serve the main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
