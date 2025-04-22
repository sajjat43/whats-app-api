// Global variables
let selectedChatId = null;
let refreshInterval = null;

// Function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Function to create a chat element
function createChatElement(chat) {
    const chatElement = document.createElement('div');
    chatElement.className = 'chat-item';
    chatElement.dataset.chatId = chat.id;

    const chatInfo = document.createElement('div');
    chatInfo.className = 'chat-info';

    const chatName = document.createElement('h3');
    // Format phone number or use name
    chatName.textContent = chat.name.replace('@c.us', '');

    const lastMessage = document.createElement('p');
    lastMessage.className = 'last-message';
    if (chat.lastMessage) {
        lastMessage.textContent = chat.lastMessage.body || 'No message content';
    } else {
        lastMessage.textContent = 'No messages';
    }

    chatInfo.appendChild(chatName);
    chatInfo.appendChild(lastMessage);
    chatElement.appendChild(chatInfo);

    if (chat.unreadCount > 0) {
        const unreadBadge = document.createElement('span');
        unreadBadge.className = 'unread-badge';
        unreadBadge.textContent = chat.unreadCount;
        chatElement.appendChild(unreadBadge);
    }

    chatElement.addEventListener('click', () => {
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('selected');
        });
        chatElement.classList.add('selected');
        selectedChatId = chat.id;
        loadMessages(chat.id);
    });

    return chatElement;
}

// Function to refresh chats
async function refreshChats() {
    try {
        const response = await fetch('/chats');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load chats');
        }

        const chatList = document.getElementById('chat-list');
        if (!chatList) {
            console.error('Chat list container not found');
            return;
        }

        chatList.innerHTML = '';
        
        if (data.chats && data.chats.length > 0) {
            data.chats.forEach(chat => {
                const chatElement = createChatElement(chat);
                chatList.appendChild(chatElement);
            });
            
            // Update chat count
            const chatCount = document.getElementById('chat-count');
            if (chatCount) {
                chatCount.textContent = `Total Chats: ${data.totalChats}`;
            }
        } else {
            chatList.innerHTML = '<div class="no-chats">No chats available</div>';
        }
    } catch (error) {
        console.error('Error refreshing chats:', error);
        showNotification('Failed to load chats: ' + error.message, 'error');
    }
}

// Function to load messages for a specific chat
async function loadMessages(chatId) {
    try {
        // Extract the phone number from the chat ID
        const phoneNumber = chatId.replace('@c.us', '');
        const response = await fetch(`/messages/${phoneNumber}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const messageContainer = document.getElementById('message-container');
        
        if (!messageContainer) {
            console.error('Message container not found');
            return;
        }

        messageContainer.innerHTML = '';

        if (data.messages) {
            Object.entries(data.messages).forEach(([date, messages]) => {
                // Add date separator
                const dateDiv = document.createElement('div');
                dateDiv.className = 'message-date-separator';
                dateDiv.textContent = date;
                messageContainer.appendChild(dateDiv);

                // Add messages for this date
                messages.forEach(message => {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = `message ${message.status === 'Sent' ? 'sent' : 'received'}`;
                    
                    const messageContent = document.createElement('div');
                    messageContent.className = 'message-content';
                    messageContent.textContent = message.body;

                    const messageTime = document.createElement('div');
                    messageTime.className = 'message-time';
                    messageTime.textContent = new Date(message.timestamp).toLocaleTimeString();

                    messageDiv.appendChild(messageContent);
                    messageDiv.appendChild(messageTime);
                    messageContainer.appendChild(messageDiv);
                });
            });
        } else {
            messageContainer.innerHTML = '<div class="no-messages">No messages available</div>';
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        showNotification('Failed to load messages: ' + error.message, 'error');
    }
}

// Function to send a message
async function sendMessage(number, message) {
    try {
        const response = await fetch('/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ number, message })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to send message');
        }

        // Refresh messages after sending
        if (selectedChatId) {
            loadMessages(selectedChatId);
        }
        
        return data;
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message: ' + error.message, 'error');
        throw error;
    }
}

// Function to check connection status
async function checkStatus() {
    try {
        const response = await fetch('/status');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const statusElement = document.getElementById('connection-status');
        
        if (statusElement) {
            statusElement.textContent = `Status: ${data.status === 'ready' ? 'Connected' : 'Disconnected'}`;
            statusElement.className = data.status === 'ready' ? 'status-connected' : 'status-disconnected';
        }
        
        return data.status === 'ready';
    } catch (error) {
        console.error('Error checking status:', error);
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = 'Status: Error';
            statusElement.className = 'status-error';
        }
        return false;
    }
}

// Function to start auto-refresh
function startAutoRefresh(interval = 30000) {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(async () => {
        const isConnected = await checkStatus();
        if (isConnected) {
            refreshChats();
            if (selectedChatId) {
                loadMessages(selectedChatId);
            }
        }
    }, interval);
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initial status check and chat load
    const isConnected = await checkStatus();
    if (isConnected) {
        refreshChats();
    }

    // Setup refresh button
    const refreshButton = document.getElementById('refreshChat');
    if (refreshButton) {
        refreshButton.addEventListener('click', refreshChats);
    }

    // Setup message form
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const numberInput = document.getElementById('phone-number');
            const messageInput = document.getElementById('message-input');
            
            if (!numberInput || !messageInput) {
                showNotification('Message form elements not found', 'error');
                return;
            }

            const number = numberInput.value.trim();
            const message = messageInput.value.trim();

            if (!number || !message) {
                showNotification('Please enter both number and message', 'error');
                return;
            }

            try {
                await sendMessage(number, message);
                messageInput.value = '';
                showNotification('Message sent successfully', 'info');
            } catch (error) {
                // Error already handled in sendMessage function
            }
        });
    }

    // Start auto-refresh
    startAutoRefresh();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}); 