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
    syncMessages(); // Run initial sync
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

// Add periodic sync for messages
async function syncMessages() {
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            try {
                // Fetch more messages to ensure we get recent ones
                const messages = await chat.fetchMessages({ limit: 100 });
                const chatId = chat.id._serialized;
                
                if (!chatHistory.has(chatId)) {
                    chatHistory.set(chatId, []);
                }

                const existingMessages = chatHistory.get(chatId);
                
                // Add new messages to history
                for (const msg of messages) {
                    // Skip if message has no content
                    if (!msg.body && !msg.hasMedia) continue;

                    const messageId = msg.id._serialized;
                    const existingMessage = existingMessages.find(m => m.messageId === messageId);
                    
                    if (!existingMessage) {
                        const messageData = {
                            timestamp: new Date(msg.timestamp * 1000).toISOString(),
                            from: msg.from,
                            to: msg.to,
                            body: msg.body,
                            status: msg.fromMe ? 'Sent' : 'Received',
                            messageId: messageId,
                            sender: chat.isGroup ? 
                                (msg._data.notifyName || msg.author || 'Unknown') : 
                                undefined,
                            fromMe: msg.fromMe,
                            hasMedia: msg.hasMedia,
                            type: msg.type
                        };
                        
                        // Insert at the correct position based on timestamp
                        const insertIndex = existingMessages.findIndex(m => 
                            new Date(m.timestamp) < new Date(messageData.timestamp)
                        );
                        
                        if (insertIndex === -1) {
                            existingMessages.push(messageData);
                        } else {
                            existingMessages.splice(insertIndex, 0, messageData);
                        }
                    }
                }

                // Sort messages by timestamp (newest first)
                chatHistory.get(chatId).sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                
                // Save chat history to file after each chat sync
                fs.writeFileSync('chatHistory.json', JSON.stringify(Array.from(chatHistory.entries()), null, 2));
            } catch (chatError) {
                console.error(`Error syncing messages for chat ${chat.id._serialized}:`, chatError);
                continue; // Continue with next chat even if one fails
            }
        }
        console.log('Message sync completed successfully');
    } catch (error) {
        console.error('Error in syncMessages:', error);
    }
}

// Increase sync frequency and add initial sync
const SYNC_INTERVAL = 10000; // Sync every 10 seconds
setInterval(syncMessages, SYNC_INTERVAL);

// Enhanced message event handler
client.on('message', async (message) => {
    try {
        console.log(`Received message from ${message.from}: ${message.body}`);
        
        const chatId = message.from;
        if (!chatHistory.has(chatId)) {
            chatHistory.set(chatId, []);
        }
        
        const messageData = {
            timestamp: new Date(message.timestamp * 1000).toISOString(),
            from: message.from,
            to: message.to,
            body: message.body,
            status: message.fromMe ? 'Sent' : 'Received',
            messageId: message.id._serialized,
            sender: message.from.includes('@g.us') ? 
                (message._data.notifyName || message.author || 'Unknown') : 
                undefined,
            fromMe: message.fromMe,
            hasMedia: message.hasMedia,
            type: message.type
        };

        // Insert message at correct position
        const existingMessages = chatHistory.get(chatId);
        const insertIndex = existingMessages.findIndex(m => 
            new Date(m.timestamp) < new Date(messageData.timestamp)
        );
        
        if (insertIndex === -1) {
            existingMessages.push(messageData);
        } else {
            existingMessages.splice(insertIndex, 0, messageData);
        }
        
        // Save chat history to file
        fs.writeFileSync('chatHistory.json', JSON.stringify(Array.from(chatHistory.entries()), null, 2));

        // Trigger immediate sync to ensure consistency
        syncMessages();
    } catch (error) {
        console.error('Error handling incoming message:', error);
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

// Export messages endpoint (placing it before other complex routes)
app.get('/export-messages', async (req, res) => {
    try {
        console.log('Received export request with query:', req.query);
        const { format = 'json', type, date, chat, search } = req.query;
        
        // Get all messages
        let allMessages = [];
        chatHistory.forEach((messages, chatId) => {
            messages.forEach(msg => {
                allMessages.push({
                    ...msg,
                    chatId,
                    chatName: msg.sender || chatId.replace('@c.us', '').replace('@g.us', ' (Group)')
                });
            });
        });

        console.log(`Total messages before filtering: ${allMessages.length}`);

        // Apply filters if provided
        if (type === 'sent') {
            allMessages = allMessages.filter(msg => msg.fromMe);
            console.log(`After sent filter: ${allMessages.length} messages`);
        } else if (type === 'received') {
            allMessages = allMessages.filter(msg => !msg.fromMe);
            console.log(`After received filter: ${allMessages.length} messages`);
        }

        if (date) {
            const filterDate = new Date(date).toLocaleDateString();
            console.log('Filtering by date:', filterDate);
            allMessages = allMessages.filter(msg => 
                new Date(msg.timestamp).toLocaleDateString() === filterDate
            );
            console.log(`After date filter: ${allMessages.length} messages`);
        }

        if (chat) {
            console.log('Filtering by chat:', chat);
            allMessages = allMessages.filter(msg => 
                msg.chatId.includes(chat) || msg.chatName.toLowerCase().includes(chat.toLowerCase())
            );
            console.log(`After chat filter: ${allMessages.length} messages`);
        }

        if (search) {
            const searchTerm = search.toLowerCase();
            console.log('Filtering by search term:', searchTerm);
            allMessages = allMessages.filter(msg => 
                msg.body?.toLowerCase().includes(searchTerm)
            );
            console.log(`After search filter: ${allMessages.length} messages`);
        }

        // Sort by timestamp
        allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Format output based on requested format
        switch (format.toLowerCase()) {
            case 'text':
                // Plain text format
                const textOutput = allMessages.map(msg => {
                    const date = new Date(msg.timestamp).toLocaleString();
                    const direction = msg.fromMe ? 'Sent' : 'Received';
                    return `[${date}] ${direction} - ${msg.chatName}: ${msg.body}`;
                }).join('\n');
                
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', 'attachment; filename=messages.txt');
                return res.send(textOutput);

            case 'csv':
                // CSV format
                const csvHeader = 'Timestamp,Direction,Chat,Message\n';
                const csvRows = allMessages.map(msg => {
                    const date = new Date(msg.timestamp).toLocaleString();
                    const direction = msg.fromMe ? 'Sent' : 'Received';
                    const chat = msg.chatName.replace(/,/g, ' ');
                    const message = msg.body?.replace(/,/g, ' ').replace(/\n/g, ' ') || '';
                    return `"${date}","${direction}","${chat}","${message}"`;
                }).join('\n');
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=messages.csv');
                return res.send(csvHeader + csvRows);

            case 'json':
            default:
                // JSON format (default)
                return res.json({
                    success: true,
                    totalMessages: allMessages.length,
                    messages: allMessages
                });
        }
    } catch (error) {
        console.error('Error exporting messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export messages',
            details: error.message
        });
    }
});

// Get messages by number or group
app.get('/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Received request for ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'ID is required' });
        }
        
        let chatId;
        if (id.includes('@g.us')) {
            // It's already a group ID
            chatId = id;
        } else {
            // Format the number to match the stored format for individual chats
            let formattedNumber = id.replace(/\D/g, '');
            if (!formattedNumber.startsWith('880')) {
                formattedNumber = '880' + formattedNumber;
            }
            chatId = formattedNumber + '@c.us';
        }
        
        console.log('Formatted chat ID:', chatId);
        
        // Get messages for this chat
        const messages = chatHistory.get(chatId) || [];
        
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
            id: chatId,
            totalMessages: messages.length,
            messages: groupedMessages
        });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message (handles both individual and group messages)
app.post('/send-message', async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({ 
                success: false,
                error: 'Number/Group ID and message are required' 
            });
        }

        // Check if client is ready
        if (!client.info) {
            return res.status(503).json({ 
                success: false,
                error: 'WhatsApp client is not ready. Please scan QR code first.' 
            });
        }

        // The number parameter can be either a phone number or a group ID
        let chatId;
        if (number.includes('@g.us')) {
            // It's a group ID, use it as is
            chatId = number;
        } else if (number.includes('@c.us')) {
            // It's already a formatted chat ID
            chatId = number;
        } else {
            // It's a phone number that needs formatting
            let formattedNumber = number.replace(/\D/g, '');
            
            // Remove any leading zeros
            formattedNumber = formattedNumber.replace(/^0+/, '');
            
            // Validate the number format
            if (!formattedNumber.match(/^\d{10,}$/)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number format. Must be a valid international number (e.g., 1234567890)'
                });
            }
            
            chatId = formattedNumber + '@c.us';
        }

        console.log('Attempting to send message to:', chatId);

        try {
            // Try to get the chat first
            const chat = await client.getChatById(chatId).catch(() => null);
            
            let result;
            if (chat) {
                // If chat exists, send through the chat object
                result = await chat.sendMessage(message);
            } else {
                // If chat doesn't exist, send directly
                result = await client.sendMessage(chatId, message);
            }

            console.log('Message sent successfully:', result);
            
            // Add to chat history
            if (!chatHistory.has(chatId)) {
                chatHistory.set(chatId, []);
            }
            
            const newMessage = {
                timestamp: new Date().toISOString(),
                from: client.info.wid._serialized,
                body: message,
                status: 'Sent',
                messageId: result.id._serialized,
                sender: chatId.includes('@g.us') ? 'You' : undefined
            };
            
            chatHistory.get(chatId).unshift(newMessage);
            
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
            console.error('Error in message sending:', error);
            
            // Check specific error types
            if (error.message.includes('wid error: invalid')) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid phone number or group ID format',
                    details: error.message
                });
            } else if (error.message.includes('not found')) {
                res.status(404).json({
                    success: false,
                    error: 'Chat or group not found',
                    details: error.message
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to send message',
                    details: error.message
                });
            }
        }
    } catch (error) {
        console.error('Error in send-message route:', error);
        res.status(500).json({ 
            success: false,
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
                timestamp: chat.timestamp,
                participants: chat.isGroup ? chat.participants?.map(p => ({
                    id: p.id._serialized,
                    name: p.name || p.id.user
                })) : null
            };
        });

        // Add chats from history that might not be in current chats
        chatHistory.forEach((messages, chatId) => {
            if (!formattedChats.find(c => c.id === chatId)) {
                formattedChats.push({
                    id: chatId,
                    name: chatId,
                    isGroup: chatId.includes('@g.us'),
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

// Get group messages
app.get('/group-messages/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        
        if (!groupId) {
            return res.status(400).json({ error: 'Group ID is required' });
        }
        
        // Get messages for this group
        const messages = chatHistory.get(groupId) || [];
        
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
            groupId: groupId,
            totalMessages: messages.length,
            messages: groupedMessages
        });
    } catch (error) {
        console.error('Error getting group messages:', error);
        res.status(500).json({ error: 'Failed to get group messages' });
    }
});

// Send message to group
app.post('/send-group-message', async (req, res) => {
    try {
        const { number: groupId, message } = req.body;
        
        if (!groupId || !message) {
            return res.status(400).json({ error: 'Group ID and message are required' });
        }

        // Check if client is ready
        if (!client.info) {
            return res.status(503).json({ error: 'WhatsApp client is not ready. Please scan QR code first.' });
        }

        // Send message
        const result = await client.sendMessage(groupId, message);
        console.log('Group message sent successfully:', result);
        
        // Add to chat history
        if (!chatHistory.has(groupId)) {
            chatHistory.set(groupId, []);
        }
        
        const newMessage = {
            timestamp: new Date().toISOString(),
            from: client.info.wid._serialized,
            body: message,
            status: 'Sent',
            messageId: result.id._serialized,
            sender: 'You' // For group messages
        };
        
        chatHistory.get(groupId).unshift(newMessage);
        
        // Save chat history to file
        try {
            fs.writeFileSync('chatHistory.json', JSON.stringify(Array.from(chatHistory.entries()), null, 2));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
        
        res.json({ 
            success: true, 
            message: 'Group message sent successfully',
            messageId: result.id._serialized,
            chatMessage: newMessage
        });
    } catch (error) {
        console.error('Error sending group message:', error);
        res.status(500).json({ 
            error: 'Failed to send group message',
            details: error.message 
        });
    }
});

// Custom endpoint to get all messages with filters
app.get('/all-messages', async (req, res) => {
    try {
        const { 
            dateFrom, 
            dateTo, 
            search, 
            type, // 'sent' or 'received'
            chatId,
            limit = 1000,
            offset = 0
        } = req.query;

        // Get all messages from chat history
        let allMessages = [];
        
        // Convert chatHistory Map to array of messages with chat info
        chatHistory.forEach((messages, chatId) => {
            const chatMessages = messages.map(msg => ({
                ...msg,
                chatId,
                chatName: msg.sender || chatId.replace('@c.us', '').replace('@g.us', ' (Group)')
            }));
            allMessages = allMessages.concat(chatMessages);
        });

        // Apply filters
        let filteredMessages = allMessages;

        // Filter by date range
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            filteredMessages = filteredMessages.filter(msg => 
                new Date(msg.timestamp) >= fromDate
            );
        }
        
        if (dateTo) {
            const toDate = new Date(dateTo);
            filteredMessages = filteredMessages.filter(msg => 
                new Date(msg.timestamp) <= toDate
            );
        }

        // Filter by message type (sent/received)
        if (type) {
            filteredMessages = filteredMessages.filter(msg => 
                type.toLowerCase() === 'sent' ? msg.fromMe : !msg.fromMe
            );
        }

        // Filter by specific chat
        if (chatId) {
            filteredMessages = filteredMessages.filter(msg => 
                msg.chatId === chatId
            );
        }

        // Filter by search term
        if (search) {
            const searchTerm = search.toLowerCase();
            filteredMessages = filteredMessages.filter(msg => 
                msg.body?.toLowerCase().includes(searchTerm) ||
                msg.chatName?.toLowerCase().includes(searchTerm)
            );
        }

        // Sort by timestamp (newest first)
        filteredMessages.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        // Apply pagination
        const totalMessages = filteredMessages.length;
        const paginatedMessages = filteredMessages.slice(offset, offset + limit);

        // Group messages by date
        const groupedMessages = {};
        paginatedMessages.forEach(message => {
            const date = new Date(message.timestamp).toLocaleDateString();
            if (!groupedMessages[date]) {
                groupedMessages[date] = [];
            }
            groupedMessages[date].push(message);
        });

        res.json({
            success: true,
            totalMessages,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(totalMessages / limit),
            messages: groupedMessages,
            filters: {
                dateFrom,
                dateTo,
                search,
                type,
                chatId,
                limit,
                offset
            }
        });

    } catch (error) {
        console.error('Error getting all messages:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get messages',
            details: error.message 
        });
    }
});

// Get message statistics
app.get('/message-stats', async (req, res) => {
    try {
        const stats = {
            totalMessages: 0,
            sentMessages: 0,
            receivedMessages: 0,
            totalChats: chatHistory.size,
            messagesByDate: {},
            activeChats: [],
            mediaMessages: 0
        };

        // Process all messages
        chatHistory.forEach((messages, chatId) => {
            const chatStats = {
                chatId,
                totalMessages: messages.length,
                sentMessages: 0,
                receivedMessages: 0,
                lastActivity: null
            };

            messages.forEach(msg => {
                stats.totalMessages++;
                
                // Count sent/received
                if (msg.fromMe) {
                    stats.sentMessages++;
                    chatStats.sentMessages++;
                } else {
                    stats.receivedMessages++;
                    chatStats.receivedMessages++;
                }

                // Count media messages
                if (msg.hasMedia) {
                    stats.mediaMessages++;
                }

                // Group by date
                const date = new Date(msg.timestamp).toLocaleDateString();
                if (!stats.messagesByDate[date]) {
                    stats.messagesByDate[date] = 0;
                }
                stats.messagesByDate[date]++;

                // Track last activity
                const msgDate = new Date(msg.timestamp);
                if (!chatStats.lastActivity || msgDate > chatStats.lastActivity) {
                    chatStats.lastActivity = msgDate;
                }
            });

            stats.activeChats.push(chatStats);
        });

        // Sort active chats by last activity
        stats.activeChats.sort((a, b) => b.lastActivity - a.lastActivity);

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Error getting message statistics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get message statistics',
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
