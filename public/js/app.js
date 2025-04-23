// Global variables
let currentChat = null;
let messageHistory = [];
let allChats = [];
let currentFilter = 'all';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    checkConnectionStatus();
    loadAllChats();
    setupEventListeners();
    setupFilters();
    setupSearch();
});

// Setup chat filters
function setupFilters() {
    const filterButtons = document.querySelectorAll('.nav-link');
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update current filter
            currentFilter = button.getAttribute('data-filter');
            // Filter chats
            filterChats();
        });
    });
}

// Filter chats based on current filter
function filterChats() {
    let filteredChats = [...allChats];
    
    switch(currentFilter) {
        case 'unread':
            filteredChats = allChats.filter(chat => chat.unreadCount > 0);
            break;
        case 'favorites':
            filteredChats = allChats.filter(chat => chat.isFavorite);
            break;
        case 'groups':
            filteredChats = allChats.filter(chat => chat.isGroup);
            break;
    }
    
    displayChats(filteredChats);
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredChats = allChats.filter(chat => {
            const name = (chat.name || '').toLowerCase();
            const lastMessage = (chat.lastMessage?.body || '').toLowerCase();
            return name.includes(searchTerm) || lastMessage.includes(searchTerm);
        });
        displayChats(filteredChats);
    });
}

// Check WhatsApp connection status
async function checkConnectionStatus() {
    try {
        const response = await fetch('/status');
        const data = await response.json();
        updateStatusUI(data.status === 'ready');
    } catch (error) {
        console.error('Error checking status:', error);
        updateStatusUI(false);
    }
}

// Update status UI
function updateStatusUI(isConnected) {
    const statusAlert = document.getElementById('statusAlert');
    const statusText = document.getElementById('connectionStatus');
    
    statusAlert.className = `alert ${isConnected ? 'alert-success' : 'alert-danger'}`;
    statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
}

// Load all chats
async function loadAllChats() {
    try {
        const response = await fetch('/chats');
        const data = await response.json();
        allChats = data.chats;
        filterChats();
    } catch (error) {
        console.error('Error loading chats:', error);
        showError('Failed to load chats');
    }
}

// Display chats in the sidebar
function displayChats(chats) {
    const chatList = document.getElementById('recentChats');
    chatList.innerHTML = '';

    chats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = `chat-item ${chat.unreadCount > 0 ? 'unread' : ''}`;
        
        const lastMessageTime = chat.lastMessage ? formatTime(chat.lastMessage.timestamp) : '';
        const lastMessageText = chat.lastMessage ? chat.lastMessage.body : '';
        
        chatElement.innerHTML = `
            <img src="https://via.placeholder.com/40" alt="Profile" class="profile-img">
            <div class="chat-info">
                <div class="chat-name">${chat.name || formatPhoneNumber(chat.id)}</div>
                ${lastMessageText ? `<div class="last-message">${lastMessageText}</div>` : ''}
                ${lastMessageTime ? `<div class="message-time">${lastMessageTime}</div>` : ''}
                ${chat.unreadCount > 0 ? `
                    <span class="badge bg-primary">${chat.unreadCount}</span>
                ` : ''}
            </div>
        `;

        chatElement.addEventListener('click', () => loadChatHistory(chat));
        chatList.appendChild(chatElement);
    });
}

// Load chat history
async function loadChatHistory(chat) {
    currentChat = chat;
    updateChatHeader(chat);
    
    try {
        const response = await fetch(`/messages/${chat.id.replace('@c.us', '')}`);
        const data = await response.json();
        messageHistory = data.messages;
        displayMessages(messageHistory);
    } catch (error) {
        console.error('Error loading chat history:', error);
        showError('Failed to load chat history');
    }
}

// Display messages in the chat area
function displayMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    Object.entries(messages).forEach(([date, msgs]) => {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'message-date';
        dateHeader.textContent = date;
        chatMessages.appendChild(dateHeader);

        msgs.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${msg.status === 'Sent' ? 'sent' : 'received'}`;
            messageElement.innerHTML = `
                <div class="message-content">
                    <div class="message-text">${msg.body}</div>
                    <div class="message-time">${formatTime(msg.timestamp)}</div>
                </div>
            `;
            chatMessages.appendChild(messageElement);
        });
    });

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update chat header
function updateChatHeader(chat) {
    const chatHeader = document.getElementById('chatHeader');
    chatHeader.innerHTML = `
        <div class="d-flex align-items-center">
            <img src="https://via.placeholder.com/40" alt="Chat" class="chat-img">
            <div class="chat-info">
                <h5 class="mb-0">${chat.name || formatPhoneNumber(chat.id)}</h5>
                ${chat.isGroup 
                    ? `<small class="text-muted">${chat.participants?.length || 0} participants</small>`
                    : `<small class="text-muted">last seen recently</small>`
                }
            </div>
        </div>
    `;
}

// Format timestamp relative to current time
function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return date.toLocaleDateString([], { weekday: 'short' });
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
}

// Format phone number for display
function formatPhoneNumber(number) {
    if (!number) return '';
    const cleaned = number.replace(/[^\d]/g, '');
    if (cleaned.startsWith('880')) {
        return '+880 ' + cleaned.slice(3).replace(/(\d{5})(\d{6})/, '$1 $2');
    }
    return number;
}

// Setup event listeners
function setupEventListeners() {
    // Start chat form
    document.getElementById('startChatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const numberInput = document.getElementById('chatNumber');
        let number = numberInput.value.trim();
        
        // Format number
        if (!number.startsWith('880')) {
            number = '880' + number;
        }
        number = number + '@c.us';

        // Check if chat already exists
        let chat = allChats.find(c => c.id === number);
        
        if (!chat) {
            // Create new chat object
            chat = {
                id: number,
                name: formatPhoneNumber(number),
                isGroup: false,
                unreadCount: 0,
                lastMessage: null
            };
            allChats.unshift(chat);
            displayChats(allChats);
        }

        loadChatHistory(chat);
        numberInput.value = '';
    });

    // Send message form
    document.getElementById('messageForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageInput = document.getElementById('message');
        const message = messageInput.value.trim();
        
        if (message && currentChat) {
            try {
                const response = await fetch('/send-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        number: currentChat.id.replace('@c.us', ''),
                        message: message
                    })
                });

                if (response.ok) {
                    messageInput.value = '';
                    // Update current chat's last message
                    currentChat.lastMessage = {
                        body: message,
                        timestamp: Math.floor(Date.now() / 1000),
                        status: 'Sent'
                    };
                    displayChats(allChats);
                    loadChatHistory(currentChat);
                } else {
                    showError('Failed to send message');
                }
            } catch (error) {
                console.error('Error sending message:', error);
                showError('Failed to send message');
            }
        }
    });

    // Refresh button
    document.getElementById('refreshChat').addEventListener('click', () => {
        loadAllChats();
        if (currentChat) {
            loadChatHistory(currentChat);
        }
    });
}

// Show error message
function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertBefore(alert, document.body.firstChild);
    setTimeout(() => alert.remove(), 5000);
} 