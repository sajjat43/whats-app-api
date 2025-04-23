// Global variables
let selectedChatId = null;
let refreshInterval = null;

// Load saved numbers from localStorage
const savedNumbers = JSON.parse(localStorage.getItem('savedNumbers') || '[]');

// Function to save a new number
function saveNumber(number) {
    if (!number) return;
    
    // Format the number
    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.startsWith('880')) {
        formattedNumber = '880' + formattedNumber;
    }
    
    // Check if number already exists
    if (!savedNumbers.includes(formattedNumber)) {
        savedNumbers.push(formattedNumber);
        localStorage.setItem('savedNumbers', JSON.stringify(savedNumbers));
        updateNumberSelect();
    }
    
    return formattedNumber;
}

// Function to update the number select dropdown
function updateNumberSelect() {
    const select = document.getElementById('saved-numbers');
    if (!select) return;
    
    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // Add saved numbers
    savedNumbers.forEach(number => {
        const option = document.createElement('option');
        option.value = number;
        option.textContent = formatPhoneNumber(number);
        select.appendChild(option);
    });
}

// Function to format phone number for display
function formatPhoneNumber(number) {
    // Remove non-digits and format as +880 XX XXXX XXXX
    const cleaned = number.replace(/\D/g, '');
    const match = cleaned.match(/^(880)?(\d{2})(\d{4})(\d{4})$/);
    if (match) {
        return `+${match[1] || '880'} ${match[2]} ${match[3]} ${match[4]}`;
    }
    return number;
}

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
    chatElement.dataset.isGroup = chat.isGroup;

    const chatInfo = document.createElement('div');
    chatInfo.className = 'chat-info';

    const chatName = document.createElement('h3');
    if (chat.isGroup) {
        chatName.textContent = chat.name;
        chatElement.classList.add('group-chat');
    } else {
        chatName.textContent = formatPhoneNumber(chat.name.replace('@c.us', ''));
    }

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
        
        // Update number input or disable it based on chat type
        const phoneInput = document.getElementById('phone-number');
        const saveNumberBtn = document.getElementById('save-number');
        const numberSelect = document.getElementById('saved-numbers');
        
        if (chat.isGroup) {
            // For groups, disable number input and show group name
            if (phoneInput) {
                phoneInput.value = chat.id; // Use the group ID instead of name
                phoneInput.disabled = true;
            }
            if (saveNumberBtn) saveNumberBtn.disabled = true;
            if (numberSelect) numberSelect.disabled = true;
        } else {
            // For individual chats, enable inputs and show number
            const number = chat.id.replace('@c.us', '');
            if (phoneInput) {
                phoneInput.value = number;
                phoneInput.disabled = false;
            }
            if (saveNumberBtn) saveNumberBtn.disabled = false;
            if (numberSelect) numberSelect.disabled = false;
            
            if (number.match(/^\d{10,}$/)) {
                saveNumber(number);
            }
        }
        
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
                
                // Save the number if it's a valid number
                const number = chat.id.replace('@c.us', '');
                if (number.match(/^880\d{10}$/)) {
                    saveNumber(number);
                }
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
        const response = await fetch(`/messages/${encodeURIComponent(chatId)}`);
        
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
                    
                    // Add sender name for group chats
                    if (message.sender && chatId.includes('@g.us')) {
                        const senderName = document.createElement('div');
                        senderName.className = 'message-sender';
                        senderName.textContent = message.sender;
                        messageContent.appendChild(senderName);
                    }
                    
                    const messageText = document.createElement('div');
                    messageText.className = 'message-text';
                    messageText.textContent = message.body;
                    messageContent.appendChild(messageText);

                    const messageTime = document.createElement('div');
                    messageTime.className = 'message-time';
                    messageTime.textContent = new Date(message.timestamp).toLocaleTimeString();

                    messageDiv.appendChild(messageContent);
                    messageDiv.appendChild(messageTime);
                    messageContainer.appendChild(messageDiv);
                });
            });
            
            // Scroll to bottom
            messageContainer.scrollTop = messageContainer.scrollHeight;
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
        // If it's a group ID, use it as is
        if (number.includes('@g.us')) {
            const response = await fetch('/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    number: number,
                    message: message
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to send message');
            }

            // Show success notification
            showNotification('Message sent successfully to group', 'info');

            // Refresh messages after sending
            if (selectedChatId) {
                await loadMessages(selectedChatId);
            }

            // Refresh chat list to show new chat if created
            await refreshChats();
            
            return data;
        }

        // For phone numbers, format and validate
        let formattedNumber = number;
        if (!number.includes('@c.us')) {
            // Remove any non-digit characters
            formattedNumber = number.replace(/\D/g, '');
            
            // Remove leading zeros
            formattedNumber = formattedNumber.replace(/^0+/, '');
            
            // Add country code if it's not there
            if (!formattedNumber.match(/^\d{10,}$/)) {
                throw new Error('Invalid phone number format. Must be a valid international number (e.g., 1234567890)');
            }
        }

        const response = await fetch('/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: selectedChatId || formattedNumber,
                message: message
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to send message');
        }

        // Show success notification
        showNotification('Message sent successfully', 'info');

        // Refresh messages after sending
        if (selectedChatId) {
            await loadMessages(selectedChatId);
        }

        // Refresh chat list to show new chat if created
        await refreshChats();
        
        return data;
    } catch (error) {
        console.error('Error sending message:', error);
        
        // Show more specific error message based on the error response
        let errorMessage = 'Failed to send message';
        
        if (error.message.includes('not ready')) {
            errorMessage = 'WhatsApp is not connected. Please scan the QR code.';
        } else if (error.message.includes('not found')) {
            errorMessage = 'Chat or group not found. Please check the number/group ID.';
        } else if (error.message.includes('Invalid phone number')) {
            errorMessage = error.message; // Use the specific validation error message
        } else if (error.message.includes('400')) {
            errorMessage = 'Please provide a valid phone number or group ID.';
        } else if (error.message.includes('503')) {
            errorMessage = 'WhatsApp service is not available. Please try again later.';
        }
        
        showNotification(errorMessage, 'error');
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
    // Update number select
    updateNumberSelect();
    
    // Initial status check and chat load
    const isConnected = await checkStatus();
    if (isConnected) {
        refreshChats();
    }

    // Setup number selection
    const numberSelect = document.getElementById('saved-numbers');
    if (numberSelect) {
        numberSelect.addEventListener('change', (e) => {
            const phoneInput = document.getElementById('phone-number');
            if (phoneInput && e.target.value) {
                phoneInput.value = e.target.value;
            }
        });
    }

    // Setup save number button
    const saveNumberBtn = document.getElementById('save-number');
    const phoneInput = document.getElementById('phone-number');
    if (saveNumberBtn && phoneInput) {
        saveNumberBtn.addEventListener('click', () => {
            const number = phoneInput.value.trim();
            if (number) {
                const formattedNumber = saveNumber(number);
                phoneInput.value = formattedNumber;
                showNotification('Number saved successfully', 'info');
            } else {
                showNotification('Please enter a valid number', 'error');
            }
        });
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
            const phoneInput = document.getElementById('phone-number');
            const messageInput = document.getElementById('message-input');
            const submitButton = messageForm.querySelector('button[type="submit"]');
            
            if (!phoneInput || !messageInput) {
                showNotification('Message form elements not found', 'error');
                return;
            }

            const number = phoneInput.value.trim();
            const message = messageInput.value.trim();

            if (!number || !message) {
                showNotification('Please enter both number and message', 'error');
                return;
            }

            // Disable form while sending
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            try {
                await sendMessage(number, message);
                messageInput.value = '';
                
                // Save the number if it's new and not a group
                if (!selectedChatId || !selectedChatId.includes('@g.us')) {
                    saveNumber(number);
                }
            } catch (error) {
                // Error already handled in sendMessage function
            } finally {
                // Re-enable form
                submitButton.disabled = false;
                submitButton.textContent = 'Send';
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