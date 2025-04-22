require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store all chats history
let chatHistory = new Map();

// Initialize WhatsApp client with proper error handling
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'whatsapp-api',
        dataPath: './whatsapp-session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    },
    qrMaxRetries: 5,
    authTimeoutMs: 60000,
    qrTimeoutMs: 40000
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
    const chatId = message.from;
    if (!chatHistory.has(chatId)) {
        chatHistory.set(chatId, []);
    }
    
    chatHistory.get(chatId).unshift({
        timestamp: new Date().toISOString(),
        from: message.from,
        body: message.body,
        status: 'Received'
    });
    
    // Save chat history to file
    try {
        fs.writeFileSync('chatHistory.json', JSON.stringify(Array.from(chatHistory.entries()), null, 2));
    } catch (error) {
        console.error('Error saving chat history:', error);
    }
});

// Load chat history from file on startup
try {
    if (fs.existsSync('chatHistory.json')) {
        const savedHistory = JSON.parse(fs.readFileSync('chatHistory.json', 'utf8'));
        chatHistory = new Map(savedHistory);
        console.log('Loaded chat history from file');
    }
} catch (error) {
    console.error('Error loading chat history:', error);
}

// Initialize client with error handling
async function initializeWhatsAppClient() {
    try {
        await client.initialize();
        console.log('WhatsApp client initialized successfully');
    } catch (error) {
        console.error('Failed to initialize WhatsApp client:', error);
        // Attempt to reinitialize after a delay
        setTimeout(initializeWhatsAppClient, 5000);
    }
}

// Start initialization
initializeWhatsAppClient();

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
        
        // Get messages for this chat
        const messages = chatHistory.get(formattedNumber) || [];
        
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
        formattedNumber = formattedNumber.replace(/\D/g, '');
        formattedNumber = formattedNumber.replace(/^0+/, '');
        
        if (!formattedNumber.startsWith('880')) {
            formattedNumber = '880' + formattedNumber;
        }
        
        formattedNumber = formattedNumber + '@c.us';
        
        console.log('Attempting to send message to:', formattedNumber);
        
        // Check if client is ready
        if (!client.info) {
            return res.status(503).json({ error: 'WhatsApp client is not ready. Please scan QR code first.' });
        }

        // Send message
        const result = await client.sendMessage(formattedNumber, message);
        console.log('Message sent successfully:', result);
        
        // Add to chat history
        if (!chatHistory.has(formattedNumber)) {
            chatHistory.set(formattedNumber, []);
        }
        
        const newMessage = {
            timestamp: new Date().toISOString(),
            from: formattedNumber,
            body: message,
            status: 'Sent',
            messageId: result.id._serialized
        };
        
        chatHistory.get(formattedNumber).unshift(newMessage);
        
        // Save chat history to file
        try {
            fs.writeFileSync('chatHistory.json', JSON.stringify(Array.from(chatHistory.entries()), null, 2));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
        
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            messageId: result.id._serialized,
            chatMessage: newMessage
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message 
        });
    }
});

// Get all groups
app.get('/groups', async (req, res) => {
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        
        res.json({
            totalGroups: groups.length,
            groups: groups.map(group => ({
                id: group.id._serialized,
                name: group.name,
                participants: group.participants.map(p => ({
                    id: p.id._serialized,
                    name: p.name || p.number
                }))
            }))
        });
    } catch (error) {
        console.error('Error getting groups:', error);
        res.status(500).json({ error: 'Failed to get groups' });
    }
});

// Get all messages
app.get('/messages', async (req, res) => {
    try {
        const chats = await client.getChats();
        const allMessages = {};
        
        for (const chat of chats) {
            const messages = await chat.fetchMessages({ limit: 100 });
            allMessages[chat.id._serialized] = {
                name: chat.name || chat.id._serialized,
                messages: messages.map(msg => ({
                    id: msg.id._serialized,
                    from: msg.from,
                    body: msg.body,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    isGroup: msg.isGroup,
                    groupName: msg.isGroup ? msg.chat.name : null
                }))
            };
        }
        
        res.json({
            totalChats: Object.keys(allMessages).length,
            messages: allMessages
        });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Get all chats
app.get('/chats', async (req, res) => {
    try {
        // Check if client is ready
        if (!client.info) {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp client is not ready. Please scan QR code first.' 
            });
        }

        const chats = await client.getChats();
        const formattedChats = chats.map(chat => {
            // Get messages from history for this chat
            const messages = chatHistory.get(chat.id._serialized) || [];
            
            return {
                id: chat.id._serialized,
                name: chat.name || chat.id._serialized,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount || 0,
                lastMessage: messages[0] || null,
                timestamp: chat.timestamp
            };
        });

        // Add chats from history that might not be in current chats
        chatHistory.forEach((messages, chatId) => {
            if (!formattedChats.find(c => c.id === chatId)) {
                formattedChats.push({
                    id: chatId,
                    name: chatId,
                    isGroup: false,
                    unreadCount: 0,
                    lastMessage: messages[0] || null,
                    timestamp: messages[0]?.timestamp || Date.now()
                });
            }
        });

        // Sort chats by timestamp
        formattedChats.sort((a, b) => {
            const timestampA = a.lastMessage?.timestamp || a.timestamp;
            const timestampB = b.lastMessage?.timestamp || b.timestamp;
            return timestampB - timestampA;
        });

        res.json({
            success: true,
            totalChats: formattedChats.length,
            chats: formattedChats
        });
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get chats',
            details: error.message 
        });
    }
});

// Serve the main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: err.message
    });
});

// Start server with error handling
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
