// Chat Application Module
let socket = null;
let currentUser = null;
let selectedChat = null;
let friends = [];
let messages = {};
let unreadConversations = new Set();

// Initialize chat application
function initChat() {
    currentUser = Auth.getCurrentUser();
    console.log('initChat - currentUser:', currentUser);
    
    if (!currentUser || !currentUser.username) {
        console.log('No valid user found, redirecting to login');
        Auth.logout();
        return;
    }

    // Connect to Socket.IO
    socket = io();
    
    // Authenticate with server
    console.log('Sending authenticate event with:', { username: currentUser.username });
    socket.emit('authenticate', { username: currentUser.username });
    
    // Set up event listeners
    setupSocketListeners();
    
    // Load friends list
    loadFriends();
}

// Socket.IO event listeners
function setupSocketListeners() {
    socket.on('authenticated', (data) => {
        if (data.success) {
            console.log('Authenticated with server');
        }
    });

    socket.on('private_message', (data) => {
        console.log('Private message received:', data);
        
        // Determine which user this chat is with
        const chatUsername = data.sender === currentUser.username ? data.recipientUsername : data.sender;
        
        // Store message
        if (!messages[chatUsername]) messages[chatUsername] = [];
        messages[chatUsername].push(data);
        
        // Only display if this is a received message (not sent by us)
        // OR if this chat is not currently selected (to handle tab switching)
        if (data.sender !== currentUser.username) {
            // Update UI if this chat is selected
            if (selectedChat === chatUsername) {
                console.log('Received message for current chat, displaying...');
                displayMessage(data);
            }
            
            // Show notification for new messages from others
            showNotification(`New message from ${data.senderName}`, () => {
                // Navigate to the sender's chat
                const sender = friends.find(f => f.username === data.sender);
                if (sender) {
                    selectChat(data.sender, data.senderName);
                }
            });
            
            // Mark conversation as having unread messages
            markConversationUnread(chatUsername);
        }
        
        // Update conversation preview for all messages
        updateConversationPreview(data);
    });

    socket.on('user_online', (data) => {
        updateUserStatus(data.username, true);
    });

    socket.on('user_offline', (data) => {
        updateUserStatus(data.username, false);
    });

    socket.on('friend_added', (data) => {
        console.log('Friend added event received:', data);
        friends.push(data);
        displayFriend(data);
        showNotification(`${data.displayName} is now your friend!`);
        
        // Also update the currentUser friends list
        if (currentUser.friends) {
            currentUser.friends.push(data);
        } else {
            currentUser.friends = [data];
        }
        
        // Save updated user data
        Auth.saveUser(currentUser);
    });

    socket.on('friend_request_accepted', (data) => {
        showNotification(`${data.displayName} accepted your friend request!`);
        loadFriends();
    });

    socket.on('error', (data) => {
        console.log('Socket error received:', data);
        showNotification(`Error: ${data.message}`);
    });
}

// Load friends list
async function loadFriends() {
    try {
        // For now, use the friends from user data
        friends = currentUser.friends || [];
        displayFriendsList();
    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

// Display friends list
async function displayFriendsList() {
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    friendsList.innerHTML = '';
    
    if (friends.length === 0) {
        friendsList.innerHTML = '<p class="no-friends">No conversations yet. Add friends to start chatting!</p>';
        return;
    }
    
    // Load recent conversations to get message previews
    try {
        const response = await fetch(`/api/conversations/${currentUser.userId}`);
        if (response.ok) {
            const conversations = await response.json();
            console.log('Loaded conversations:', conversations);
            
            // Create a map of username to conversation data
            const conversationMap = new Map();
            conversations.forEach(conv => {
                conversationMap.set(conv.username, conv);
            });
            
            // Display friends with conversation data
            friends.forEach(friend => displayFriend(friend, conversationMap.get(friend.username)));
        } else {
            // Fallback to displaying friends without conversation data
            friends.forEach(friend => displayFriend(friend));
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
        // Fallback to displaying friends without conversation data
        friends.forEach(friend => displayFriend(friend));
    }
}

// Display single friend (conversation item)
function displayFriend(friend, conversationData = null) {
    console.log('displayFriend called with:', friend, conversationData);
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    // Handle different friend data structures
    const displayName = friend.displayName || friend.display_name || friend.username;
    const username = friend.username;
    const isOnline = friend.isOnline || friend.is_online || false;
    
    if (!displayName || !username) {
        console.error('Invalid friend data:', friend);
        return;
    }
    
    // Use conversation data if available, otherwise fall back to local cache
    let previewText = 'No messages yet';
    let messageTime = '';
    
    if (conversationData) {
        previewText = conversationData.last_message || 'No messages yet';
        messageTime = conversationData.last_message_time ? formatMessageTime(conversationData.last_message_time) : '';
    } else {
        // Fallback to local cache
        const lastMessage = getLastMessage(username);
        previewText = lastMessage ? lastMessage.message : 'No messages yet';
        messageTime = lastMessage ? formatMessageTime(lastMessage.timestamp) : '';
    }
    
    const friendEl = document.createElement('div');
    friendEl.className = 'conversation-item';
    friendEl.dataset.username = username;
    friendEl.innerHTML = `
        <div class="conversation-avatar">
            ${displayName[0].toUpperCase()}
            <span class="unread-indicator"></span>
        </div>
        <div class="conversation-content">
            <div class="conversation-header-info">
                <div class="conversation-name">${displayName}</div>
                <div class="conversation-time">${messageTime}</div>
            </div>
            <div class="conversation-details">${username}</div>
            <div class="conversation-preview">${escapeHtml(previewText)}</div>
        </div>
        <div class="conversation-status">${isOnline ? '🟢' : ''}</div>
    `;
    
    friendEl.onclick = () => {
        selectChat(username, displayName);
        // Clear unread indicator when chat is selected
        markConversationRead(username);
    };
    friendsList.appendChild(friendEl);
}

// Send message
function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim() || !selectedChat || !socket) return;
    
    const message = input.value.trim();
    
    // Create message data
    const messageData = {
        sender: currentUser.username,
        senderName: currentUser.displayName,
        message: message,
        timestamp: new Date().toISOString(),
        recipientUsername: selectedChat
    };
    
    // Store message locally
    if (!messages[selectedChat]) messages[selectedChat] = [];
    messages[selectedChat].push(messageData);
    
    // Display immediately
    displayMessage(messageData);
    
    // Send via Socket.IO
    socket.emit('private_message', {
        recipientUsername: selectedChat,
        message: message
    });
    
    // Clear input
    input.value = '';
    input.focus();
}

// Display message
function displayMessage(data) {
    const messagesEl = document.getElementById('messages');
    if (!messagesEl) return;
    
    const isSent = data.sender === currentUser.username;
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(data.message)}</div>
        <div class="message-info">
            <div class="message-time">${time}</div>
        </div>
    `;
    
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Add friend function - opens new chat page
async function addFriend() {
    showNewChatView();
}

// Show new chat view
function showNewChatView() {
    const conversationsView = document.getElementById('conversationsView');
    const newChatView = document.getElementById('newChatView');
    
    conversationsView.classList.remove('active');
    newChatView.classList.add('active');
    
    // Focus on search input
    setTimeout(() => {
        const searchInput = document.getElementById('newChatSearchInput');
        if (searchInput) {
            searchInput.focus();
        }
    }, 300);
}

// Handle new chat search
function handleNewChatSearch(event) {
    const query = event.target.value.trim();
    const clearBtn = document.querySelector('.clear-search-btn');
    
    if (query.length > 0) {
        clearBtn.classList.remove('hidden');
        
        if (query.length > 2) {
            searchUsersInNewChat(query);
        }
    } else {
        clearBtn.classList.add('hidden');
        showNewChatPlaceholder();
    }
}

// Clear new chat search
function clearNewChatSearch() {
    const searchInput = document.getElementById('newChatSearchInput');
    const clearBtn = document.querySelector('.clear-search-btn');
    
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    showNewChatPlaceholder();
    searchInput.focus();
}

// Search users in new chat view
async function searchUsersInNewChat(query) {
    const resultsContainer = document.getElementById('newChatSearchResults');
    const loadingState = document.getElementById('newChatLoading');
    
    // Show loading
    resultsContainer.innerHTML = '';
    loadingState.classList.remove('hidden');
    
    try {
        const response = await fetch(`/api/search/${encodeURIComponent(query)}`);
        const users = await response.json();
        
        // Hide loading
        loadingState.classList.add('hidden');
        
        displayNewChatSearchResults(users);
    } catch (error) {
        console.error('Search error:', error);
        loadingState.classList.add('hidden');
        showNewChatError();
    }
}

// Display search results in new chat view
function displayNewChatSearchResults(users) {
    const resultsContainer = document.getElementById('newChatSearchResults');
    
    if (users.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results-state">
                <div class="no-results-icon">🔍</div>
                <h3>No users found</h3>
                <p>Try searching with a different username</p>
            </div>
        `;
        return;
    }
    
    resultsContainer.innerHTML = '';
    
    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'new-chat-result-item';
        userEl.innerHTML = `
            <div class="result-avatar">${user.display_name[0].toUpperCase()}</div>
            <div class="result-info">
                <div class="result-name">${user.display_name}</div>
                <div class="result-username">${user.username}</div>
            </div>
            <button class="result-action" onclick="addUserAsFriend('${user.username}', '${user.display_name}')">
                Add Friend
            </button>
        `;
        resultsContainer.appendChild(userEl);
    });
}

// Show placeholder in new chat
function showNewChatPlaceholder() {
    const resultsContainer = document.getElementById('newChatSearchResults');
    resultsContainer.innerHTML = `
        <div class="search-placeholder">
            <div class="placeholder-icon">👋</div>
            <h3>Find your friends</h3>
            <p>Search for users by their username to start a conversation</p>
        </div>
    `;
}

// Show error state
function showNewChatError() {
    const resultsContainer = document.getElementById('newChatSearchResults');
    resultsContainer.innerHTML = `
        <div class="no-results-state">
            <div class="no-results-icon">⚠️</div>
            <h3>Search failed</h3>
            <p>Please check your connection and try again</p>
        </div>
    `;
}

// Add user as friend from search results
function addUserAsFriend(username, displayName) {
    if (socket) {
        socket.emit('add_friend', { friendUsername: username });
        
        // Show feedback
        showNotification(`Friend request sent to ${displayName}`);
        
        // Go back to conversations after a moment
        setTimeout(() => {
            backToConversations();
        }, 1500);
    }
}

// Search users
async function searchUsers(query) {
    try {
        const response = await fetch(`/api/search/${encodeURIComponent(query)}`);
        const users = await response.json();
        displaySearchResults(users);
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getLastMessage(username) {
    if (!messages[username] || messages[username].length === 0) {
        return null;
    }
    return messages[username][messages[username].length - 1];
}

function formatMessageTime(timestamp) {
    const now = new Date();
    const messageDate = new Date(timestamp);
    const diffMs = now - messageDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        // Today - show time
        return messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } else if (diffDays === 1) {
        // Yesterday
        return 'Yesterday';
    } else if (diffDays < 7) {
        // This week - show day
        return messageDate.toLocaleDateString([], {weekday: 'short'});
    } else {
        // Older - show date
        return messageDate.toLocaleDateString([], {month: 'short', day: 'numeric'});
    }
}

function updateConversationPreview(messageData) {
    // Determine which user this chat is with
    const chatUsername = messageData.sender === currentUser.username ? 
        messageData.recipientUsername : messageData.sender;
    
    const friendEl = document.querySelector(`[data-username="${chatUsername}"]`);
    if (friendEl) {
        const previewEl = friendEl.querySelector('.conversation-preview');
        const timeEl = friendEl.querySelector('.conversation-time');
        
        if (previewEl) {
            const prefix = messageData.sender === currentUser.username ? 'You: ' : '';
            previewEl.textContent = prefix + messageData.message;
        }
        
        if (timeEl) {
            timeEl.textContent = formatMessageTime(messageData.timestamp);
        }
        
        // Move to top of list
        const friendsList = document.getElementById('friendsList');
        if (friendsList && friendEl.parentNode === friendsList) {
            friendsList.removeChild(friendEl);
            friendsList.insertBefore(friendEl, friendsList.firstChild);
        }
    }
}

function showNotification(message, clickHandler = null) {
    // Simple notification
    console.log('Notification:', message);
    
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = message;
    
    // Make clickable if handler provided
    if (clickHandler) {
        notif.style.cursor = 'pointer';
        notif.onclick = () => {
            clickHandler();
            notif.remove();
        };
    }
    
    document.body.appendChild(notif);
    
    setTimeout(() => notif.remove(), 3000);
}

function updateUserStatus(username, isOnline) {
    const friendEl = document.querySelector(`[data-username="${username}"]`);
    if (friendEl) {
        const statusEl = friendEl.querySelector('.conversation-status');
        if (statusEl) {
            statusEl.textContent = isOnline ? '🟢' : '';
        }
    }
}

async function loadMessages(username) {
    const messagesEl = document.getElementById('messages');
    if (!messagesEl) return;
    
    messagesEl.innerHTML = '';
    
    try {
        // First check if we have the recipient's user ID
        const recipient = friends.find(f => f.username === username);
        if (!recipient || !currentUser) {
            console.log('Recipient or current user not found for message loading');
            return;
        }
        
        // Load message history from server
        const response = await fetch(`/api/messages/private/${currentUser.userId}/${recipient.user_id || recipient.userId}`);
        if (response.ok) {
            const serverMessages = await response.json();
            console.log('Loaded messages from server:', serverMessages);
            
            // Store messages locally and display them
            messages[username] = serverMessages;
            serverMessages.forEach(msg => {
                // Convert server message format to our format
                const messageData = {
                    sender: msg.sender_username,
                    senderName: msg.sender_display_name,
                    message: msg.message,
                    timestamp: msg.timestamp,
                    recipientUsername: msg.recipient_username
                };
                displayMessage(messageData);
            });
        } else {
            console.log('Failed to load message history');
            // Fall back to cached messages if server fails
            if (messages[username]) {
                messages[username].forEach(msg => displayMessage(msg));
            }
        }
    } catch (error) {
        console.error('Error loading message history:', error);
        // Fall back to cached messages if there's an error
        if (messages[username]) {
            messages[username].forEach(msg => displayMessage(msg));
        }
    }
}

// Mark conversation as having unread messages
function markConversationUnread(username) {
    if (username === selectedChat) {
        // Don't mark as unread if we're currently viewing this chat
        return;
    }
    
    unreadConversations.add(username);
    const friendEl = document.querySelector(`[data-username="${username}"]`);
    if (friendEl) {
        const indicator = friendEl.querySelector('.unread-indicator');
        if (indicator) {
            indicator.classList.add('active');
        }
    }
}

// Mark conversation as read
function markConversationRead(username) {
    unreadConversations.delete(username);
    const friendEl = document.querySelector(`[data-username="${username}"]`);
    if (friendEl) {
        const indicator = friendEl.querySelector('.unread-indicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }
}