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
    const baseUrl = req.headers.host || 'localhost:3000';
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
    
    // Get user's friends
    const friends = await User.getFriends(user.user_id);
    
    res.json({
      success: true,
      user: {
        username: user.username,
        displayName: user.display_name,
        userId: user.user_id,
        qrCode: user.qr_code,
        shareableLink: user.shareable_link,
        friends
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // User authentication via socket
  socket.on('authenticate', async (userData) => {
    try {
      const user = await User.findByUsername(userData.username);
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
        
        // Get user's friends and notify them
        const friends = await User.getFriends(user.user_id);
        for (const friend of friends) {
          if (friend.is_online) {
            socket.broadcast.to(friend.user_id).emit('user_online', {
              username: user.username,
              displayName: user.display_name
            });
          }
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
      
      if (!sender) return;
      
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
      
      // Send message to room (both users)
      const messageData = {
        id: savedMessage.id,
        roomId,
        sender: sender.username,
        senderName: sender.display_name,
        message,
        timestamp: savedMessage.timestamp
      };
      
      io.to(roomId).emit('private_message', messageData);
      
      // If recipient is online, add them to room and notify
      const recipientSocket = [...activeUsers.values()].find(u => u.user_id === recipient.user_id);
      if (recipientSocket) {
        io.sockets.sockets.get(recipientSocket.socketId)?.join(roomId);
      }
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
      const { friendUsername } = data;
      const user = activeUsers.get(socket.id);
      
      if (!user) return;
      
      const friend = await User.findByUsername(friendUsername);
      if (!friend) {
        socket.emit('error', { message: 'User not found' });
        return;
      }
      
      // Add friend relationship
      await User.addFriend(user.user_id, friend.user_id);
      
      socket.emit('friend_added', {
        username: friend.username,
        displayName: friend.display_name,
        isOnline: friend.is_online
      });
      
      // Notify friend if online
      const friendSocket = [...activeUsers.values()].find(u => u.user_id === friend.user_id);
      if (friendSocket) {
        io.to(friendSocket.socketId).emit('friend_request_accepted', {
          username: user.username,
          displayName: user.display_name
        });
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
      console.log(`Iran Chat Server running on port ${PORT}`);
      console.log(`Access at: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();