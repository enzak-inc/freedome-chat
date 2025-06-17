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
        // Store message
        const chatId = data.sender === currentUser.username ? data.recipient : data.sender;
        if (!messages[chatId]) messages[chatId] = [];
        messages[chatId].push(data);
        
        // Update UI if this chat is selected
        if (selectedChat === chatId) {
            displayMessage(data);
        }
        
        // Show notification for new messages
        if (data.sender !== currentUser.username) {
            showNotification(`New message from ${data.senderName}`);
        }
    });

    socket.on('user_online', (data) => {
        updateUserStatus(data.username, true);
    });

    socket.on('user_offline', (data) => {
        updateUserStatus(data.username, false);
    });

    socket.on('friend_added', (data) => {
        friends.push(data);
        displayFriend(data);
        showNotification(`${data.displayName} is now your friend!`);
    });

    socket.on('friend_request_accepted', (data) => {
        showNotification(`${data.displayName} accepted your friend request!`);
        loadFriends();
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
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    const friendEl = document.createElement('div');
    friendEl.className = 'friend-item';
    friendEl.dataset.username = friend.username;
    friendEl.innerHTML = `
        <div class="friend-avatar">${friend.displayName[0].toUpperCase()}</div>
        <div class="friend-info">
            <div class="friend-name">${friend.displayName}</div>
            <div class="friend-username">${friend.username}</div>
        </div>
        <div class="friend-status ${friend.isOnline ? 'online' : 'offline'}"></div>
    `;
    
    friendEl.onclick = () => selectChat(friend.username, friend.displayName);
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
        document.getElementById('chatHeader').innerHTML = `
            <h3>${displayName} <span class="chat-username">${username}</span></h3>
        `;
    }
    
    // Enable message input
    if (messageInput && sendBtn) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
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
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${data.sender === currentUser.username ? 'sent' : 'received'}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString();
    
    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(data.message)}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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
});