// Global variables
let currentChatNumber = null;
let recentChats = new Set();
const API_BASE_URL = 'http://localhost:3001';  // Update this to match your server port

// DOM Elements
const startChatForm = document.getElementById('startChatForm');
const messageForm = document.getElementById('messageForm');
const chatMessagesContainer = document.getElementById('chatMessages');
const recentChatsList = document.getElementById('recentChats');
const refreshButton = document.getElementById('refreshChat');
const statusAlert = document.getElementById('statusAlert');
const connectionStatus = document.getElementById('connectionStatus');
const chatHeader = document.getElementById('chatHeader');

// Check connection status
async function checkConnectionStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`);
        const data = await response.json();
        
        if (data.status === 'ready') {
            statusAlert.className = 'alert alert-success';
            connectionStatus.textContent = 'Connected';
        } else {
            statusAlert.className = 'alert alert-warning';
            connectionStatus.textContent = 'Not Connected - Please scan QR code';
        }
    } catch (error) {
        statusAlert.className = 'alert alert-danger';
        connectionStatus.textContent = 'Connection Error';
    }
}

// Initialize
async function initialize() {
    try {
        await checkConnectionStatus();
        
        // Load any existing recent chats from localStorage
        const savedChats = localStorage.getItem('recentChats');
        if (savedChats) {
            recentChats = new Set(JSON.parse(savedChats));
            renderRecentChats();
        }
        
        // Check connection status every 30 seconds
        setInterval(checkConnectionStatus, 30000);
    } catch (error) {
        console.error('Initialization error:', error);
        statusAlert.className = 'alert alert-danger';
        connectionStatus.textContent = 'Initialization Error';
    }
}

// Render chat messages
async function renderChatMessages(messages) {
    if (!chatMessagesContainer) {
        console.error('Chat messages container not found');
        return;
    }

    chatMessagesContainer.innerHTML = '';

    if (!messages || (Array.isArray(messages) && messages.length === 0) || (typeof messages === 'object' && Object.keys(messages).length === 0)) {
        chatMessagesContainer.innerHTML = '<div class="no-messages">No messages yet</div>';
        return;
    }

    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'messages-container';

    // If messages is an array, group them by date
    let groupedMessages = {};
    if (Array.isArray(messages)) {
        messages.forEach(message => {
            const date = new Date(message.timestamp).toLocaleDateString();
            if (!groupedMessages[date]) {
                groupedMessages[date] = [];
            }
            groupedMessages[date].push(message);
        });
    } else {
        groupedMessages = messages;
    }

    // Sort dates in ascending order
    const sortedDates = Object.keys(groupedMessages).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA - dateB;
    });

    sortedDates.forEach(date => {
        // Add date divider
        const dateDiv = document.createElement('div');
        dateDiv.className = 'date-divider';
        const dateSpan = document.createElement('span');
        dateSpan.textContent = formatDate(new Date(date));
        dateDiv.appendChild(dateSpan);
        messagesContainer.appendChild(dateDiv);

        // Add messages for this date
        const dateMessages = groupedMessages[date];
        if (Array.isArray(dateMessages)) {
            dateMessages.forEach(message => {
                const messageDiv = document.createElement('div');
                const isReceived = message.from && message.from.includes('@c.us');
                messageDiv.className = `message ${isReceived ? 'received' : 'sent'}`;

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.textContent = message.body || message.content;

                const metaDiv = document.createElement('div');
                metaDiv.className = 'message-meta';

                const timeSpan = document.createElement('span');
                timeSpan.className = 'message-time';
                timeSpan.textContent = formatTime(new Date(message.timestamp));
                metaDiv.appendChild(timeSpan);

                if (!isReceived && message.status) {
                    const statusSpan = document.createElement('span');
                    statusSpan.className = 'message-status';
                    statusSpan.textContent = message.status;
                    metaDiv.appendChild(statusSpan);
                }

                messageDiv.appendChild(contentDiv);
                messageDiv.appendChild(metaDiv);
                messagesContainer.appendChild(messageDiv);
            });
        }
    });

    chatMessagesContainer.appendChild(messagesContainer);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// Format date for display
function formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Format time for display
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Format message content
function formatMessageContent(content) {
    // Replace URLs with clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
}

// Render recent chats
function renderRecentChats() {
    recentChatsList.innerHTML = '';
    
    if (recentChats.size === 0) {
        recentChatsList.innerHTML = '<div class="text-center text-muted">No recent chats</div>';
        return;
    }
    
    recentChats.forEach(number => {
        const chatItem = document.createElement('a');
        chatItem.href = '#';
        chatItem.className = `recent-chat ${number === currentChatNumber ? 'active' : ''}`;
        chatItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>${number}</div>
                <small class="text-muted">Click to open chat</small>
            </div>
        `;
        
        chatItem.addEventListener('click', (e) => {
            e.preventDefault();
            loadChatMessages(number);
        });
        
        recentChatsList.appendChild(chatItem);
    });
    
    // Save recent chats to localStorage
    localStorage.setItem('recentChats', JSON.stringify(Array.from(recentChats)));
}

// Send message
async function sendMessage(message) {
    try {
        const response = await fetch(`${API_BASE_URL}/send-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: currentChatNumber,
                message: message
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // Reload chat messages
            await loadChatMessages(currentChatNumber);
            return true;
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        return false;
    }
}

// Event Listeners
startChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const number = document.getElementById('chatNumber').value;
    if (number) {
        // Format the number to include country code
        let formattedNumber = number.replace(/\D/g, '');
        if (!formattedNumber.startsWith('880')) {
            formattedNumber = '880' + formattedNumber;
        }
        await loadChatMessages(formattedNumber);
        startChatForm.reset();
    }
});

messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentChatNumber) {
        alert('Please start a chat first');
        return;
    }
    
    const message = document.getElementById('message').value;
    if (message) {
        const success = await sendMessage(message);
        if (success) {
            messageForm.reset();
        }
    }
});

refreshButton.addEventListener('click', () => {
    if (currentChatNumber) {
        loadChatMessages(currentChatNumber);
    }
});

// Load chat messages
async function loadChatMessages(number) {
    try {
        // Format the number to include country code if not present
        let formattedNumber = number.replace(/\D/g, '');
        if (!formattedNumber.startsWith('880')) {
            formattedNumber = '880' + formattedNumber;
        }
        
        const response = await fetch(`${API_BASE_URL}/messages/${formattedNumber}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        currentChatNumber = formattedNumber;
        
        // Update chat header
        chatHeader.innerHTML = `
            <h5 class="mb-0">Chat with ${currentChatNumber}</h5>
            <small class="text-muted">${data.totalMessages} messages</small>
        `;
        
        console.log('Received messages:', data.messages); // Debug log
        await renderChatMessages(data.messages);
        
        // Add to recent chats
        if (!recentChats.has(formattedNumber)) {
            recentChats.add(formattedNumber);
            renderRecentChats();
        }
    } catch (error) {
        console.error('Error loading chat messages:', error);
        alert('Error loading chat messages. Please try again.');
    }
}

// Initialize the app
initialize(); 