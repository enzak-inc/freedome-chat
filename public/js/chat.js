// Chat Application Module
let socket = null;
let currentUser = null;
let selectedChat = null;
let friends = [];
let messages = {};
let unreadConversations = new Set();
let lastMessageDate = null;

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
    
    // Check if we need to open a chat with someone (from profile page)
    checkForAutoOpenChat();
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
            showNotification(`پیام جدید از ${data.senderName}`, () => {
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
        showNotification(`${data.displayName} اکنون دوست شماست!`);
        
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
        showNotification(`${data.displayName} درخواست دوستی شما را پذیرفت!`);
        loadFriends();
    });

    socket.on('error', (data) => {
        console.log('Socket error received:', data);
        showNotification(`خطا: ${data.message}`);
    });

    // Group-related socket events
    socket.on('group_created', (data) => {
        console.log('Group created event received:', data);
        showNotification(`گروه "${data.groupName}" با موفقیت ایجاد شد!`);
        
        // Reset create group form
        const createBtn = document.getElementById('createGroupBtn');
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'ایجاد گروه';
        }
        
        // Go back to conversations and refresh
        if (typeof backToConversations === 'function') {
            backToConversations();
        }
        
        // Refresh both friends and groups list
        loadFriends();
    });

    socket.on('group_message', (data) => {
        console.log('Group message received:', data);
        
        // Store message for group
        if (!messages[data.groupId]) messages[data.groupId] = [];
        messages[data.groupId].push(data);
        
        // Only display if this is a received message (not sent by us)
        if (data.sender !== currentUser.username) {
            // Update UI if this group chat is selected
            if (selectedChat === data.groupId) {
                console.log('Received group message for current chat, displaying...');
                displayGroupMessage(data);
            }
            
            // Show notification for new messages from others
            showNotification(`پیام جدید در گروه از ${data.senderName}`, () => {
                // Navigate to the group chat
                selectGroupChat(data.groupId, data.groupName || `گروه ${data.groupId.slice(0, 8)}`);
            });
            
            // Mark conversation as having unread messages
            markConversationUnread(data.groupId);
        }
        
        // Update conversation preview for group messages
        updateGroupConversationPreview(data);
    });
}

// Load friends and groups list
let groups = [];

async function loadFriends() {
    try {
        console.log('Loading friends and groups from server for user:', currentUser.userId);
        
        // Fetch friends from server API
        const friendsResponse = await fetch(`/api/friends/${currentUser.userId}`);
        if (friendsResponse.ok) {
            friends = await friendsResponse.json();
            console.log('Loaded friends from server:', friends);
        } else {
            console.error('Failed to load friends from server');
            friends = [];
        }

        // Fetch groups from server API
        const groupsResponse = await fetch(`/api/groups/user/${currentUser.userId}`);
        if (groupsResponse.ok) {
            groups = await groupsResponse.json();
            console.log('Loaded groups from server:', groups);
        } else {
            console.error('Failed to load groups from server');
            groups = [];
        }
        
        displayFriendsList();
    } catch (error) {
        console.error('Error loading friends and groups:', error);
        friends = [];
        groups = [];
        displayFriendsList();
    }
}

// Display friends and groups list
async function displayFriendsList() {
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    friendsList.innerHTML = '';
    
    if (friends.length === 0 && groups.length === 0) {
        friendsList.innerHTML = '<p class="no-friends">هنوز مکالمه‌ای ندارید. برای شروع چت، دوستان اضافه کنید یا گروه جدید بسازید!</p>';
        return;
    }
    
    // Load recent conversations to get message previews for friends
    try {
        const response = await fetch(`/api/conversations/${currentUser.userId}`);
        if (response.ok) {
            const conversations = await response.json();
            console.log('Loaded conversations:', conversations);
            
            // Create a map of username to friend data
            const friendsMap = new Map();
            friends.forEach(friend => {
                friendsMap.set(friend.username, friend);
            });
            
            // Display group conversations first
            groups.forEach(group => {
                displayGroup(group);
            });
            
            // Display friend conversations in order (most recent first)
            conversations.forEach(conv => {
                const friend = friendsMap.get(conv.username);
                if (friend) {
                    displayFriend(friend, conv);
                }
            });
            
            // Display remaining friends without recent conversations (at the bottom)
            friends.forEach(friend => {
                const hasConversation = conversations.some(conv => conv.username === friend.username);
                if (!hasConversation) {
                    displayFriend(friend);
                }
            });
        } else {
            // Fallback to displaying groups and friends without conversation data
            groups.forEach(group => displayGroup(group));
            friends.forEach(friend => displayFriend(friend));
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
        // Fallback to displaying groups and friends without conversation data
        groups.forEach(group => displayGroup(group));
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
    let previewText = 'هنوز پیامی نیست';
    let messageTime = '';
    
    if (conversationData) {
        previewText = conversationData.last_message || 'هنوز پیامی نیست';
        messageTime = conversationData.last_message_time ? formatMessageTime(conversationData.last_message_time) : '';
    } else {
        // Fallback to local cache
        const lastMessage = getLastMessage(username);
        previewText = lastMessage ? lastMessage.message : 'هنوز پیامی نیست';
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
    
    // Check if this conversation has unread messages and apply indicator
    if (unreadConversations.has(username)) {
        const indicator = friendEl.querySelector('.unread-indicator');
        if (indicator) {
            indicator.classList.add('active');
        }
    }
    
    friendsList.appendChild(friendEl);
}

// Display single group (conversation item)
function displayGroup(group) {
    console.log('displayGroup called with:', group);
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    const groupName = group.group_name || `گروه ${group.group_id.slice(0, 8)}`;
    const memberCount = group.member_count || 0;
    
    // Get last message for group (if any)
    let previewText = 'هنوز پیامی نیست';
    let messageTime = '';
    
    const lastMessage = getLastMessage(group.group_id);
    if (lastMessage) {
        previewText = lastMessage.message;
        messageTime = formatMessageTime(lastMessage.timestamp);
    }
    
    const groupEl = document.createElement('div');
    groupEl.className = 'conversation-item group-conversation';
    groupEl.dataset.groupId = group.group_id;
    groupEl.innerHTML = `
        <div class="conversation-avatar group-avatar">
            👥
            <span class="unread-indicator"></span>
        </div>
        <div class="conversation-content">
            <div class="conversation-header-info">
                <div class="conversation-name">${escapeHtml(groupName)}</div>
                <div class="conversation-time">${messageTime}</div>
            </div>
            <div class="conversation-details">${memberCount} عضو</div>
            <div class="conversation-preview">${escapeHtml(previewText)}</div>
        </div>
        <div class="conversation-status"></div>
    `;
    
    groupEl.onclick = () => {
        selectGroupChat(group.group_id, groupName);
        // Clear unread indicator when group chat is selected
        markConversationRead(group.group_id);
    };
    
    // Check if this group conversation has unread messages and apply indicator
    if (unreadConversations.has(group.group_id)) {
        const indicator = groupEl.querySelector('.unread-indicator');
        if (indicator) {
            indicator.classList.add('active');
        }
    }
    
    friendsList.appendChild(groupEl);
}

// Select group chat
function selectGroupChat(groupId, groupName) {
    selectedChat = groupId;
    
    // Switch views
    const conversationsView = document.getElementById('conversationsView');
    const chatView = document.getElementById('chatView');
    
    conversationsView.classList.remove('active');
    chatView.classList.add('active');
    
    // Update chat header for group
    const chatName = document.getElementById('chatName');
    const chatUsername = document.getElementById('chatUsername');
    
    if (chatName) chatName.textContent = groupName;
    if (chatUsername) chatUsername.textContent = 'گروه';
    
    // Enable message input
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (messageInput && sendBtn) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = 'پیام خود را بنویسید...';
    }
    
    // Clear unread indicator when group chat is selected
    markConversationRead(groupId);
    
    // Load group messages
    loadGroupMessages(groupId);
}

// Load group messages
async function loadGroupMessages(groupId) {
    try {
        const response = await fetch(`/api/messages/group/${groupId}?limit=50&offset=0`);
        if (response.ok) {
            const groupMessages = await response.json();
            console.log('Loaded group messages:', groupMessages);
            
            // Store messages
            messages[groupId] = groupMessages;
            
            // Clear and display messages
            const messagesEl = document.getElementById('messages');
            if (messagesEl) {
                messagesEl.innerHTML = '';
                lastMessageDate = null;
                groupMessages.forEach(msg => displayGroupMessage(msg));
            }
        } else {
            console.error('Failed to load group messages');
        }
    } catch (error) {
        console.error('Error loading group messages:', error);
    }
}

// Display group message
function displayGroupMessage(data) {
    const messagesEl = document.getElementById('messages');
    if (!messagesEl) return;
    
    const messageDate = new Date(data.timestamp);
    const messageDateStr = messageDate.toDateString();
    
    // Add date separator if this is a different day than the last message
    if (lastMessageDate !== messageDateStr) {
        addDateSeparator(messagesEl, messageDate);
        lastMessageDate = messageDateStr;
    }
    
    // Handle both real-time messages (sender) and database messages (sender_username)
    const senderUsername = data.sender || data.sender_username;
    const isSent = senderUsername === currentUser.username;
    const messageEl = document.createElement('div');
    
    // Detect text direction
    const textDirection = detectTextDirection(data.message);
    messageEl.className = `message ${isSent ? 'sent' : 'received'} ${textDirection} group-message`;
    messageEl.dir = textDirection;
    
    const formattedTime = formatMessageTimestamp(data.timestamp);
    // Handle both real-time messages (senderName) and database messages (sender_display_name)
    const senderName = data.senderName || data.sender_display_name || senderUsername;
    
    messageEl.innerHTML = `
        <div class="message-content">
            ${!isSent ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
            ${escapeHtml(data.message)}
        </div>
        <div class="message-info">
            <div class="message-time">${formattedTime}</div>
        </div>
    `;
    
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Update group conversation preview
function updateGroupConversationPreview(messageData) {
    const groupEl = document.querySelector(`[data-group-id="${messageData.groupId}"]`);
    if (!groupEl) return;
    
    const previewEl = groupEl.querySelector('.conversation-preview');
    const timeEl = groupEl.querySelector('.conversation-time');
    
    if (previewEl) {
        const senderName = messageData.senderName || messageData.sender;
        const preview = `${senderName}: ${messageData.message}`;
        previewEl.textContent = preview;
    }
    
    if (timeEl) {
        timeEl.textContent = formatMessageTime(messageData.timestamp);
    }
    
    // Move group to top of list
    const friendsList = document.getElementById('friendsList');
    if (friendsList && groupEl) {
        friendsList.insertBefore(groupEl, friendsList.firstChild);
    }
}

// Send message (updated to handle groups)
function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim() || !selectedChat || !socket) return;
    
    const message = input.value.trim();
    
    // Check if current chat is a group (groups have UUID format)
    const isGroupChat = selectedChat.includes('-') && selectedChat.length > 20;
    
    // Create message data
    const messageData = {
        sender: currentUser.username,
        senderName: currentUser.displayName,
        message: message,
        timestamp: new Date().toISOString()
    };
    
    if (isGroupChat) {
        messageData.groupId = selectedChat;
        
        // Store message locally
        if (!messages[selectedChat]) messages[selectedChat] = [];
        messages[selectedChat].push(messageData);
        
        // Display immediately
        displayGroupMessage(messageData);
        
        // Send via Socket.IO
        socket.emit('group_message', {
            groupId: selectedChat,
            message: message
        });
    } else {
        messageData.recipientUsername = selectedChat;
        
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
    }
    
    // Clear input
    input.value = '';
    input.focus();
}

// Display message
function displayMessage(data) {
    const messagesEl = document.getElementById('messages');
    if (!messagesEl) return;
    
    const messageDate = new Date(data.timestamp);
    const messageDateStr = messageDate.toDateString();
    
    // Add date separator if this is a different day than the last message
    if (lastMessageDate !== messageDateStr) {
        addDateSeparator(messagesEl, messageDate);
        lastMessageDate = messageDateStr;
    }
    
    const isSent = data.sender === currentUser.username;
    const messageEl = document.createElement('div');
    
    // Detect text direction
    const textDirection = detectTextDirection(data.message);
    messageEl.className = `message ${isSent ? 'sent' : 'received'} ${textDirection}`;
    messageEl.dir = textDirection;
    
    const formattedTime = formatMessageTimestamp(data.timestamp);
    
    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(data.message)}</div>
        <div class="message-info">
            <div class="message-time">${formattedTime}</div>
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
                <h3>کاربری یافت نشد</h3>
                <p>با نام کاربری متفاوتی جستجو کنید</p>
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
افزودن دوست
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
            <h3>دوستان خود را پیدا کنید</h3>
            <div class="search-guide">
                <h4>📖 راهنمای جستجو:</h4>
                <ul class="guide-list">
                    <li>
                        <span class="guide-icon">🔍</span>
                        <span class="guide-text">حداقل <strong>3 حرف</strong> از نام کاربری یا نام نمایشی را تایپ کنید</span>
                    </li>
                    <li>
                        <span class="guide-icon">👤</span>
                        <span class="guide-text">با <strong>نام کاربری</strong>: مثل <code>@ali</code> یا <code>sara</code> (@ اختیاری است)</span>
                    </li>
                    <li>
                        <span class="guide-icon">📝</span>
                        <span class="guide-text">با <strong>نام نمایشی</strong>: مثل <code>علی رضا</code> یا <code>سارا محمدی</code></span>
                    </li>
                    <li>
                        <span class="guide-icon">⚡</span>
                        <span class="guide-text">جستجو <strong>بلافاصله</strong> پس از تایپ 3 حرف شروع می‌شود</span>
                    </li>
                </ul>
                <div class="search-tip">
                    💡 <strong>نکته:</strong> اگر دوست شما را پیدا نمی‌کنید، از او بخواهید نام کاربری دقیقش را به شما بدهد
                </div>
            </div>
        </div>
    `;
}

// Show error state
function showNewChatError() {
    const resultsContainer = document.getElementById('newChatSearchResults');
    resultsContainer.innerHTML = `
        <div class="no-results-state">
            <div class="no-results-icon">⚠️</div>
            <h3>جستجو ناموفق</h3>
            <p>لطفاً اتصال خود را بررسی و دوباره تلاش کنید</p>
        </div>
    `;
}

// Add user as friend from search results
function addUserAsFriend(username, displayName) {
    if (socket) {
        socket.emit('add_friend', { friendUsername: username });
        
        // Show feedback
        showNotification(`درخواست دوستی به ${displayName} ارسال شد`);
        
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

// Detect text direction (RTL for Farsi/Arabic, LTR for English/others)
function detectTextDirection(text) {
    // Persian/Farsi Unicode ranges: \u0600-\u06FF (Arabic block), \u0750-\u077F (Arabic Supplement)
    // Also includes \u08A0-\u08FF (Arabic Extended-A), \uFB50-\uFDFF (Arabic Presentation Forms-A)
    const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF]/;
    
    // Remove spaces, numbers, and punctuation for better detection
    const cleanText = text.replace(/[\s\d\p{P}]/gu, '');
    
    // If text contains RTL characters, return RTL
    if (rtlRegex.test(cleanText)) {
        return 'rtl';
    }
    
    // Default to LTR for English and other languages
    return 'ltr';
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
        return 'دیروز';
    } else if (diffDays < 7) {
        // This week - show day
        return messageDate.toLocaleDateString([], {weekday: 'short'});
    } else {
        // Older - show date
        return messageDate.toLocaleDateString([], {month: 'short', day: 'numeric'});
    }
}

// Enhanced timestamp formatting for individual messages
function formatMessageTimestamp(timestamp) {
    const messageDate = new Date(timestamp);
    
    // Since we have date separators, just show the time for individual messages
    return messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Add date separator
function addDateSeparator(messagesEl, messageDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const messageDay = new Date(messageDate);
    messageDay.setHours(0, 0, 0, 0);
    
    let dateLabel;
    if (messageDay.getTime() === today.getTime()) {
        dateLabel = 'امروز';
    } else if (messageDay.getTime() === yesterday.getTime()) {
        dateLabel = 'دیروز';
    } else {
        dateLabel = messageDate.toLocaleDateString([], {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }
    
    const separatorEl = document.createElement('div');
    separatorEl.className = 'date-separator';
    separatorEl.innerHTML = `<span class="date-text">${dateLabel}</span>`;
    messagesEl.appendChild(separatorEl);
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
    lastMessageDate = null; // Reset date tracking
    
    try {
        // First check if we have the recipient's user ID
        const recipient = friends.find(f => f.username === username);
        if (!recipient || !currentUser) {
            console.log('Recipient or current user not found for message loading');
            return;
        }
        
        // Load message history from server
        const recipientId = recipient.user_id || recipient.userId;
        console.log('Loading messages between:', currentUser.userId, 'and', recipientId);
        const response = await fetch(`/api/messages/private/${currentUser.userId}/${recipientId}`);
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
    
    // Always add to unread set (this persists even when not in conversations view)
    unreadConversations.add(username);
    
    // Try to update the indicator if the element exists (when in conversations view)
    const friendEl = document.querySelector(`[data-username="${username}"]`);
    if (friendEl) {
        const indicator = friendEl.querySelector('.unread-indicator');
        if (indicator) {
            indicator.classList.add('active');
        }
    }
    // Note: If element doesn't exist (e.g., in chat view), the indicator will be 
    // applied when returning to conversations view via displayFriend() function
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

// Check if we need to auto-open a chat (from profile page friend add)
function checkForAutoOpenChat() {
    const chatToOpen = localStorage.getItem('openChatWith');
    if (chatToOpen) {
        // Remove the item so it doesn't keep opening
        localStorage.removeItem('openChatWith');
        
        // Wait a bit for friends to load, then try to open the chat
        setTimeout(() => {
            const friend = friends.find(f => f.username === chatToOpen);
            if (friend) {
                const displayName = friend.displayName || friend.display_name || friend.username;
                selectChat(chatToOpen, displayName);
                showNotification(`چت با ${displayName} باز شد`);
            } else {
                // Friend not found yet, maybe they were just added - reload friends
                loadFriends().then(() => {
                    setTimeout(() => {
                        const newFriend = friends.find(f => f.username === chatToOpen);
                        if (newFriend) {
                            const displayName = newFriend.displayName || newFriend.display_name || newFriend.username;
                            selectChat(chatToOpen, displayName);
                            showNotification(`چت با ${displayName} باز شد`);
                        }
                    }, 500);
                });
            }
        }, 1000);
    }
}