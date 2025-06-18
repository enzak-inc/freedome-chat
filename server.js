require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { initializeDatabase } = require('./database/database');
const User = require('./database/models/User');
const Message = require('./database/models/Message');
const Group = require('./database/models/Group');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Active users tracking (socketId -> userInfo)
const activeUsers = new Map();

// Password validation
function validatePassword(password) {
  // Strong password: 8+ chars, uppercase, lowercase, number, special char
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])/;
  return password.length >= 8 && strongRegex.test(password);
}

// User registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    
    // Validate username format (@username)
    if (!username.startsWith('@') || username.length < 4) {
      return res.status(400).json({ error: 'Username must start with @ and be at least 4 characters' });
    }
    
    // Check if username exists
    const exists = await User.exists(username);
    if (exists) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Validate password strength
    if (!validatePassword(password)) {
      return res.status(400).json({ 
        error: 'Password must be 8+ characters with uppercase, lowercase, number, and special character' 
      });
    }
    
    // Create user with database model
    const baseUrl = process.env.BASE_URL || `http://${req.headers.host || 'localhost:3000'}`;
    const user = await User.create({
      username,
      displayName,
      password,
      baseUrl
    });
    
    res.json({
      success: true,
      user
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate credentials
    const user = await User.validatePassword(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Don't send friends list on login, fetch separately
    res.json({
      success: true,
      user: {
        username: user.username,
        displayName: user.display_name,
        userId: user.user_id,
        qrCode: user.qr_code,
        shareableLink: user.shareable_link
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user profile by username (for shareable links)
app.get('/api/user/:username', async (req, res) => {
  try {
    const username = req.params.username.startsWith('@') ? req.params.username : '@' + req.params.username;
    const user = await User.getPublicProfile(username);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Search users
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const results = await User.search(query, 10);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get message history
app.get('/api/messages/private/:userId1/:userId2', async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const messages = await Message.getPrivateMessages(
      userId1, 
      userId2, 
      parseInt(limit), 
      parseInt(offset)
    );
    
    res.json(messages);
  } catch (error) {
    console.error('Message fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get group messages
app.get('/api/messages/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const messages = await Message.getGroupMessages(
      groupId, 
      parseInt(limit), 
      parseInt(offset)
    );
    
    res.json(messages);
  } catch (error) {
    console.error('Group message fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch group messages' });
  }
});

// Get user's groups
app.get('/api/groups/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const groups = await Group.getUserGroups(userId);
    res.json(groups);
  } catch (error) {
    console.error('Groups fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get user's friends
app.get('/api/friends/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const friends = await User.getFriends(userId);
    res.json(friends);
  } catch (error) {
    console.error('Friends fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Get recent conversations
app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const conversations = await Message.getRecentConversations(userId);
    res.json(conversations);
  } catch (error) {
    console.error('Conversations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Add friend endpoint
app.post('/api/add-friend', async (req, res) => {
  try {
    const { userId, friendUsername } = req.body;
    
    if (!userId || !friendUsername) {
      return res.status(400).json({ error: 'User ID and friend username are required' });
    }
    
    // Find the friend by username
    const friend = await User.findByUsername(friendUsername);
    if (!friend) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't allow adding yourself as friend
    if (userId === friend.user_id) {
      return res.status(400).json({ error: 'Cannot add yourself as friend' });
    }
    
    // Add friend relationship
    const success = await User.addFriend(userId, friend.user_id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Friend added successfully',
        friend: {
          username: friend.username,
          displayName: friend.display_name,
          isOnline: friend.is_online
        }
      });
    } else {
      res.status(500).json({ error: 'Failed to add friend' });
    }
    
  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// Update user profile
app.post('/api/user/update-profile', async (req, res) => {
  try {
    const { userId, displayName, currentPassword, newPassword } = req.body;
    
    if (!userId || !displayName) {
      return res.status(400).json({ error: 'User ID and display name are required' });
    }
    
    // Validate display name (basic validation)
    if (displayName.trim().length < 1 || displayName.trim().length > 100) {
      return res.status(400).json({ error: 'Display name must be between 1 and 100 characters' });
    }
    
    // Check if password change is requested
    const isPasswordChange = currentPassword && newPassword;
    
    if (isPasswordChange) {
      // Validate current password
      const user = await User.findByUserId(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const isCurrentPasswordValid = await User.validatePasswordById(userId, currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      
      // Validate new password strength
      if (!validatePassword(newPassword)) {
        return res.status(400).json({ 
          error: 'New password must be 8+ characters with uppercase, lowercase, number, and special character' 
        });
      }
      
      // Update both display name and password
      const passwordUpdateSuccess = await User.updatePassword(userId, newPassword);
      const nameUpdateSuccess = await User.updateDisplayName(userId, displayName.trim());
      
      if (passwordUpdateSuccess && nameUpdateSuccess) {
        res.json({ success: true, message: 'Profile and password updated successfully' });
      } else {
        res.status(500).json({ error: 'Failed to update profile' });
      }
    } else {
      // Update only display name
      const success = await User.updateDisplayName(userId, displayName.trim());
      
      if (success) {
        res.json({ success: true, message: 'Profile updated successfully' });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    }
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // User authentication via socket
  socket.on('authenticate', async (userData) => {
    try {
      console.log('Socket authenticate request:', userData);
      
      if (!userData || !userData.username) {
        console.log('Invalid authentication data received');
        socket.emit('authenticated', { success: false, error: 'Invalid authentication data' });
        return;
      }
      
      const user = await User.findByUsername(userData.username);
      console.log('User found in database:', user ? 'Yes' : 'No');
      
      if (user) {
        // Update online status
        await User.updateOnlineStatus(user.user_id, true);
        
        // Track active user
        const activeUser = {
          ...user,
          socketId: socket.id
        };
        activeUsers.set(socket.id, activeUser);
        socket.userId = user.user_id;
        socket.username = user.username;
        
        // Join user to their personal room
        socket.join(user.user_id);
        
        // Get user's friends and join chat rooms with them
        const friends = await User.getFriends(user.user_id);
        console.log(`User ${user.username} has ${friends.length} friends`);
        
        for (const friend of friends) {
          // Join room for each friend for instant message delivery
          const roomId = [user.user_id, friend.user_id].sort().join('_');
          socket.join(roomId);
          console.log(`Joined room ${roomId} for friend ${friend.username}`);
          
          // Notify online friends that user is online
          if (friend.is_online) {
            socket.broadcast.to(friend.user_id).emit('user_online', {
              username: user.username,
              displayName: user.display_name
            });
          }
        }

        // Get user's groups and join group rooms
        const groups = await Group.getUserGroups(user.user_id);
        console.log(`User ${user.username} is member of ${groups.length} groups`);
        
        for (const group of groups) {
          // Join group room for instant message delivery
          socket.join(group.group_id);
          console.log(`Joined group room ${group.group_id} for group ${group.group_name}`);
        }
        
        socket.emit('authenticated', { success: true });
      } else {
        socket.emit('authenticated', { success: false, error: 'User not found' });
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });
  
  // One-to-one chat
  socket.on('private_message', async (data) => {
    try {
      const { recipientUsername, message } = data;
      const sender = activeUsers.get(socket.id);
      
      if (!sender) {
        console.log('Sender not found in active users');
        return;
      }
      
      const recipient = await User.findByUsername(recipientUsername);
      
      if (!recipient) {
        socket.emit('error', { message: 'User not found' });
        return;
      }
      
      // Save message to database
      const savedMessage = await Message.create({
        senderId: sender.user_id,
        recipientId: recipient.user_id,
        message,
        messageType: 'text'
      });
      
      // Create or find private room
      const roomId = [sender.user_id, recipient.user_id].sort().join('_');
      socket.join(roomId);
      
      // If recipient is online, add them to room
      const recipientSocket = [...activeUsers.values()].find(u => u.user_id === recipient.user_id);
      if (recipientSocket) {
        const recipientSocketObj = io.sockets.sockets.get(recipientSocket.socketId);
        if (recipientSocketObj) {
          recipientSocketObj.join(roomId);
        }
      }
      
      // Send message to room (both users)
      const messageData = {
        id: savedMessage.id,
        roomId,
        sender: sender.username,
        senderName: sender.display_name,
        message,
        timestamp: savedMessage.timestamp,
        recipientUsername: recipient.username
      };
      
      io.to(roomId).emit('private_message', messageData);
    } catch (error) {
      console.error('Private message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Group chat creation
  socket.on('create_group', async (data) => {
    try {
      const { groupName, memberUsernames } = data;
      const creator = activeUsers.get(socket.id);
      
      if (!creator) return;
      
      // Get member IDs from usernames
      const memberIds = [];
      for (const username of memberUsernames || []) {
        const user = await User.findByUsername(username);
        if (user) {
          memberIds.push(user.user_id);
        }
      }
      
      // Create group
      const group = await Group.create({
        groupName,
        adminId: creator.user_id,
        memberIds
      });
      
      // Get all members info
      const members = await Group.getMembers(group.groupId);
      
      // Add all online members to the socket room
      for (const member of members) {
        const memberSocket = [...activeUsers.values()].find(u => u.user_id === member.user_id);
        if (memberSocket) {
          io.sockets.sockets.get(memberSocket.socketId)?.join(group.groupId);
        }
      }
      
      // Notify group creation
      io.to(group.groupId).emit('group_created', {
        groupId: group.groupId,
        groupName: group.groupName,
        admin: creator.display_name,
        members: members.map(m => ({
          username: m.username,
          displayName: m.display_name,
          isOnline: m.is_online
        }))
      });
    } catch (error) {
      console.error('Group creation error:', error);
      socket.emit('error', { message: 'Failed to create group' });
    }
  });
  
  // Group message
  socket.on('group_message', async (data) => {
    try {
      const { groupId, message } = data;
      const sender = activeUsers.get(socket.id);
      
      if (!sender) return;
      
      // Check if user is a member
      const isMember = await Group.isMember(groupId, sender.user_id);
      if (!isMember) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }
      
      // Save message to database
      const savedMessage = await Message.create({
        senderId: sender.user_id,
        groupId,
        message,
        messageType: 'text'
      });
      
      io.to(groupId).emit('group_message', {
        id: savedMessage.id,
        groupId,
        sender: sender.username,
        senderName: sender.display_name,
        message,
        timestamp: savedMessage.timestamp
      });
    } catch (error) {
      console.error('Group message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Add friend
  socket.on('add_friend', async (data) => {
    try {
      console.log('Add friend request:', data);
      const { friendUsername } = data;
      const user = activeUsers.get(socket.id);
      
      if (!user) {
        console.log('User not found in active users');
        socket.emit('error', { message: 'Authentication required' });
        return;
      }
      
      console.log('Looking for friend with username:', friendUsername);
      const friend = await User.findByUsername(friendUsername);
      if (!friend) {
        console.log('Friend not found in database');
        socket.emit('error', { message: 'User not found' });
        return;
      }
      
      // Don't allow adding yourself as friend
      if (user.user_id === friend.user_id) {
        socket.emit('error', { message: 'Cannot add yourself as friend' });
        return;
      }
      
      console.log('Adding friendship between:', user.username, 'and', friend.username);
      
      // Add friend relationship
      const success = await User.addFriend(user.user_id, friend.user_id);
      
      if (success) {
        console.log('Friendship added successfully');
        
        socket.emit('friend_added', {
          username: friend.username,
          displayName: friend.display_name,
          isOnline: friend.is_online
        });
        
        // Notify friend if online
        const friendSocket = [...activeUsers.values()].find(u => u.user_id === friend.user_id);
        if (friendSocket) {
          console.log('Notifying friend that they were added');
          io.to(friendSocket.socketId).emit('friend_request_accepted', {
            username: user.username,
            displayName: user.display_name
          });
        }
      }
    } catch (error) {
      console.error('Add friend error:', error);
      socket.emit('error', { message: 'Failed to add friend' });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', async () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      try {
        // Update online status in database
        await User.updateOnlineStatus(user.user_id, false);
        
        // Get user's friends and notify them
        const friends = await User.getFriends(user.user_id);
        for (const friend of friends) {
          if (friend.is_online) {
            socket.broadcast.to(friend.user_id).emit('user_offline', {
              username: user.username
            });
          }
        }
        
        activeUsers.delete(socket.id);
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle shareable profile links
app.get('/@:username', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    server.listen(PORT, () => {
      console.log(`Free Iran Server running on port ${PORT}`);
      console.log(`Access at: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();