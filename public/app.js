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
        
        // Update chat header
        const chatHeader = document.getElementById('chat-header');
        if (chatHeader) {
            chatHeader.textContent = chat.isGroup ? chat.name : formatPhoneNumber(chat.name.replace('@c.us', ''));
        }
        
        // Update number input or disable it based on chat type
        const phoneInput = document.getElementById('phone-number');
        const saveNumberBtn = document.getElementById('save-number');
        const numberSelect = document.getElementById('saved-numbers');
        
        if (chat.isGroup) {
            if (phoneInput) {
                phoneInput.value = chat.id;
                phoneInput.disabled = true;
            }
            if (saveNumberBtn) saveNumberBtn.disabled = true;
            if (numberSelect) numberSelect.disabled = true;
        } else {
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
        const response = await fetch(`/messages/${chatId}`);
        const data = await response.json();
        
        const messageContainer = document.getElementById('message-container');
        if (!messageContainer) {
            console.error('Message container not found');
            return;
        }
        
        messageContainer.innerHTML = '';
        
        if (data.messages && Object.keys(data.messages).length > 0) {
            // Sort date keys in descending order (newest first)
            const sortedDates = Object.keys(data.messages).sort((a, b) => {
                const dateA = new Date(a);
                const dateB = new Date(b);
                return dateB - dateA;
            });

            // Create a container for all messages
            const messagesWrapper = document.createElement('div');
            messagesWrapper.className = 'messages-wrapper';
            messageContainer.appendChild(messagesWrapper);

            sortedDates.forEach(date => {
                // Add date separator
                const dateDiv = document.createElement('div');
                dateDiv.className = 'date-separator';
                dateDiv.textContent = date;
                messagesWrapper.appendChild(dateDiv);

                // Add messages for this date, sorted newest to oldest
                [...data.messages[date]]
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .forEach(message => {
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
                        
                        // Add media content if present
                        if (message.hasMedia && message.media) {
                            const mediaContainer = document.createElement('div');
                            mediaContainer.className = 'message-media';
                            
                            if (message.media.type.startsWith('image/')) {
                                const img = document.createElement('img');
                                img.src = message.media.url;
                                img.alt = 'Image';
                                img.className = 'message-image';
                                img.onerror = () => {
                                    img.src = '/placeholder-image.png';
                                    img.alt = 'Failed to load image';
                                };
                                mediaContainer.appendChild(img);
                            } else if (message.media.type.startsWith('audio/')) {
                                const audio = document.createElement('audio');
                                audio.controls = true;
                                audio.src = message.media.url;
                                audio.className = 'message-audio';
                                audio.onerror = () => {
                                    audio.parentElement.innerHTML = '<div class="media-error">Failed to load audio</div>';
                                };
                                mediaContainer.appendChild(audio);
                            } else if (message.media.type.startsWith('video/')) {
                                const video = document.createElement('video');
                                video.controls = true;
                                video.src = message.media.url;
                                video.className = 'message-video';
                                video.onerror = () => {
                                    video.parentElement.innerHTML = '<div class="media-error">Failed to load video</div>';
                                };
                                mediaContainer.appendChild(video);
                            }
                            
                            messageContent.appendChild(mediaContainer);
                        }
                        
                        // Add text content if present
                        if (message.body) {
                            const messageText = document.createElement('div');
                            messageText.className = 'message-text';
                            messageText.textContent = message.body;
                            messageContent.appendChild(messageText);
                        }

                        const messageTime = document.createElement('div');
                        messageTime.className = 'message-time';
                        messageTime.textContent = new Date(message.timestamp).toLocaleTimeString();

                        messageDiv.appendChild(messageContent);
                        messageDiv.appendChild(messageTime);
                        messagesWrapper.appendChild(messageDiv);
                    });
            });
            
            // Scroll to top to show newest messages
            messageContainer.scrollTop = 0;
        } else {
            messageContainer.innerHTML = '<div class="no-messages">No messages available</div>';
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        showNotification('Failed to load messages: ' + error.message, 'error');
    }
}

// Function to handle file attachments
function handleFileAttachment(file) {
    const previewContainer = document.querySelector('.preview-container') || createPreviewContainer();
    const previewItem = document.createElement('div');
    previewItem.className = 'preview-item';
    
    const removeButton = document.createElement('button');
    removeButton.className = 'remove-preview';
    removeButton.innerHTML = '×';
    removeButton.onclick = () => previewItem.remove();
    
    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        previewItem.appendChild(img);
    } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        previewItem.appendChild(video);
    } else if (file.type.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = URL.createObjectURL(file);
        audio.controls = true;
        previewItem.appendChild(audio);
    }
    
    previewItem.appendChild(removeButton);
    previewContainer.appendChild(previewItem);
}

function createPreviewContainer() {
    const container = document.createElement('div');
    container.className = 'preview-container';
    document.querySelector('.message-form').insertBefore(container, document.querySelector('.message-form button'));
    return container;
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

    // Setup file attachment
    const fileAttachment = document.getElementById('file-attachment');
    if (fileAttachment) {
        fileAttachment.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileAttachment(file);
            }
        });
    }

    // Setup message form
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageInput = document.getElementById('message-input');
            const submitButton = messageForm.querySelector('button[type="submit"]');
            const fileInput = document.getElementById('file-attachment');
            
            if (!selectedChatId) {
                showNotification('Please select a chat first', 'error');
                return;
            }
            if (!messageInput) {
                showNotification('Message input not found', 'error');
                return;
            }

            const number = selectedChatId;
            const message = messageInput.value.trim();
            const file = fileInput.files[0];

            if (!message && !file) {
                showNotification('Please enter a message or attach a file', 'error');
                return;
            }

            // Disable form while sending
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            try {
                if (file) {
                    // Create FormData for file upload
                    const formData = new FormData();
                    formData.append('number', number);
                    formData.append('message', message);
                    formData.append('file', file);

                    const response = await fetch('/send-message', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || `HTTP error! status: ${response.status}`);
                    }

                    // Clear file input and preview
                    fileInput.value = '';
                    const previewContainer = document.querySelector('.preview-container');
                    if (previewContainer) {
                        previewContainer.remove();
                    }
                } else {
                    await sendMessage(number, message);
                }

                messageInput.value = '';
            } catch (error) {
                showNotification(error.message, 'error');
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

// Update sendMessage function to handle both text and media
async function sendMessage(number, message) {
    try {
        const response = await fetch('/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ number, message })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('Error sending message:', error);
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

// Add automatic message refresh
function startAutoRefresh() {
    // Refresh messages every 10 seconds
    setInterval(async () => {
        const currentChat = document.querySelector('.chat-item.selected');
        if (currentChat) {
            const chatId = currentChat.dataset.chatId;
            await loadMessages(chatId);
        }
    }, 10000);
} 