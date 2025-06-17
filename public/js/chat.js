// Chat Application Module
let socket = null;
let currentUser = null;
let selectedChat = null;
let friends = [];
let messages = {};

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
    
    // Update UI with user info
    updateUserInfo();
    
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
        
        // Update UI if this chat is selected
        if (selectedChat === chatUsername) {
            console.log('Message is for current chat, displaying...');
            displayMessage(data);
        } else {
            console.log('Message is for different chat:', chatUsername, 'Current chat:', selectedChat);
        }
        
        // Show notification for new messages from others
        if (data.sender !== currentUser.username) {
            showNotification(`New message from ${data.senderName}`);
            
            // Update friend list to show new message indicator (optional)
            const friendEl = document.querySelector(`[data-username="${data.sender}"]`);
            if (friendEl) {
                friendEl.style.backgroundColor = '#e3f2fd';
            }
        }
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
function displayFriendsList() {
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    friendsList.innerHTML = '';
    
    if (friends.length === 0) {
        friendsList.innerHTML = '<p class="no-friends">No friends yet. Add friends to start chatting!</p>';
        return;
    }
    
    friends.forEach(friend => displayFriend(friend));
}

// Display single friend
function displayFriend(friend) {
    console.log('displayFriend called with:', friend);
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
    
    // Get last message for preview
    const lastMessage = getLastMessage(username);
    const previewText = lastMessage ? lastMessage.message : 'No messages yet';
    const messageTime = lastMessage ? formatMessageTime(lastMessage.timestamp) : '';
    
    const friendEl = document.createElement('div');
    friendEl.className = 'friend-item';
    friendEl.dataset.username = username;
    friendEl.innerHTML = `
        <div class="friend-avatar">${displayName[0].toUpperCase()}</div>
        <div class="friend-info">
            <div class="friend-header">
                <div class="friend-name">${displayName}</div>
                <div class="friend-time">${messageTime}</div>
            </div>
            <div class="friend-preview">${escapeHtml(previewText)}</div>
            <div class="friend-username">${username}</div>
        </div>
        <div class="friend-status ${isOnline ? '›' : ''}">${isOnline ? '›' : ''}</div>
    `;
    
    // Use mobile-aware select function
    friendEl.onclick = () => {
        if (window.innerWidth <= 768) {
            selectChatMobile(username, displayName);
        } else {
            selectChat(username, displayName);
        }
    };
    
    friendsList.appendChild(friendEl);
}

// Select a chat
function selectChat(username, displayName) {
    selectedChat = username;
    
    // Update UI
    document.querySelectorAll('.friend-item').forEach(el => {
        el.classList.toggle('active', el.dataset.username === username);
    });
    
    // Show chat area
    const chatArea = document.getElementById('chatArea');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (chatArea) {
        chatArea.classList.remove('hidden');
        
        // Update chat header with new structure
        const chatTitleName = document.getElementById('chatTitleName');
        const chatTitleUsername = document.getElementById('chatTitleUsername');
        
        if (chatTitleName) chatTitleName.textContent = displayName;
        if (chatTitleUsername) chatTitleUsername.textContent = username;
    }
    
    // Enable message input
    if (messageInput && sendBtn) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = 'iMessage';
    }
    
    // Load messages
    loadMessages(username);
}

// Send message
function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim() || !selectedChat || !socket) return;
    
    const message = input.value.trim();
    
    // Send via Socket.IO
    socket.emit('private_message', {
        recipientUsername: selectedChat,
        message: message
    });
    
    // Display immediately
    displayMessage({
        sender: currentUser.username,
        senderName: currentUser.displayName,
        message: message,
        timestamp: new Date().toISOString()
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
    
    // Check if this should be grouped with previous message
    const lastMessage = messagesEl.lastElementChild;
    const shouldGroup = lastMessage && 
        lastMessage.classList.contains(isSent ? 'sent' : 'received') &&
        !lastMessage.classList.contains('show-time');
    
    if (shouldGroup) {
        messageEl.classList.add('consecutive');
        lastMessage.classList.add('consecutive');
    }
    
    const time = new Date(data.timestamp).toLocaleTimeString();
    
    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(data.message)}</div>
        <div class="message-time">${time}</div>
    `;
    
    // Show time on tap (mobile) or after certain interval
    messageEl.addEventListener('click', () => {
        messageEl.classList.toggle('show-time');
    });
    
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Update friend list preview
    updateFriendPreview(data);
}

// Add friend
async function addFriend() {
    const username = prompt('Enter friend username (e.g., @username):');
    if (!username) return;
    
    // Ensure username starts with @
    const friendUsername = username.startsWith('@') ? username : '@' + username;
    
    if (socket) {
        socket.emit('add_friend', { friendUsername });
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

// Update user info in UI
function updateUserInfo() {
    const userInfoEl = document.getElementById('userInfo');
    if (userInfoEl && currentUser) {
        userInfoEl.innerHTML = `
            <div class="user-avatar">${currentUser.displayName[0].toUpperCase()}</div>
            <div class="user-details">
                <div class="user-name">${currentUser.displayName}</div>
                <div class="user-username">${currentUser.username}</div>
            </div>
            <button onclick="logout()" class="logout-btn">Logout</button>
        `;
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

function updateFriendPreview(messageData) {
    // Determine which user this chat is with
    const chatUsername = messageData.sender === currentUser.username ? 
        messageData.recipientUsername : messageData.sender;
    
    const friendEl = document.querySelector(`[data-username="${chatUsername}"]`);
    if (friendEl) {
        const previewEl = friendEl.querySelector('.friend-preview');
        const timeEl = friendEl.querySelector('.friend-time');
        
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

function showNotification(message) {
    // Simple notification for now
    console.log('Notification:', message);
    
    // You can implement a better notification system
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => notif.remove(), 3000);
}

function updateUserStatus(username, isOnline) {
    const friendEl = document.querySelector(`[data-username="${username}"]`);
    if (friendEl) {
        const statusEl = friendEl.querySelector('.friend-status');
        if (statusEl) {
            statusEl.className = `friend-status ${isOnline ? 'online' : 'offline'}`;
        }
    }
}

function loadMessages(username) {
    const messagesEl = document.getElementById('messages');
    if (!messagesEl) return;
    
    messagesEl.innerHTML = '';
    
    // Display cached messages if any
    if (messages[username]) {
        messages[username].forEach(msg => displayMessage(msg));
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    if (Auth.isLoggedIn()) {
        initChat();
    }
    
    // Handle window resize for mobile/desktop transitions
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && selectedChat) {
            // Desktop view - ensure chat area is visible
            const chatArea = document.getElementById('chatArea');
            const sidebar = document.getElementById('sidebar');
            
            if (chatArea) chatArea.classList.remove('active-mobile');
            if (sidebar) sidebar.classList.remove('hidden-mobile');
        }
    });
});