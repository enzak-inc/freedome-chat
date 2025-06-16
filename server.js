const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const path = require('path');

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

// In-memory storage (replace with SQLite for persistence)
const users = new Map();
const activeUsers = new Map(); // socketId -> userInfo
const privateRooms = new Map(); // roomId -> [user1, user2]
const groupRooms = new Map();   // roomId -> {name, members[], admin}

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
    if (users.has(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Validate password strength
    if (!validatePassword(password)) {
      return res.status(400).json({ 
        error: 'Password must be 8+ characters with uppercase, lowercase, number, and special character' 
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Generate user ID and QR code
    const userId = uuidv4();
    const baseUrl = req.headers.host || 'localhost:3000';
    const shareableLink = `http://${baseUrl}${username}`;
    
    // Generate QR code for user profile
    const qrCodeData = JSON.stringify({
      username,
      displayName,
      shareableLink,
      userId
    });
    const qrCode = await QRCode.toDataURL(qrCodeData);
    
    // Create user object
    const user = {
      username,
      displayName,
      passwordHash,
      userId,
      qrCode,
      shareableLink,
      joinedAt: new Date().toISOString(),
      isOnline: false,
      friends: [],
      blockedUsers: []
    };
    
    // Store user
    users.set(username, user);
    
    res.json({
      success: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        userId: user.userId,
        qrCode: user.qrCode,
        shareableLink: user.shareableLink
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = users.get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Return user info (excluding sensitive data)
    res.json({
      success: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        userId: user.userId,
        qrCode: user.qrCode,
        shareableLink: user.shareableLink,
        friends: user.friends
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user profile by username (for shareable links)
app.get('/api/user/:username', (req, res) => {
  const username = req.params.username.startsWith('@') ? req.params.username : '@' + req.params.username;
  const user = users.get(username);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Return public profile info only
  res.json({
    username: user.username,
    displayName: user.displayName,
    shareableLink: user.shareableLink,
    qrCode: user.qrCode,
    isOnline: user.isOnline
  });
});

// Search users
app.get('/api/search/:query', (req, res) => {
  const query = req.params.query.toLowerCase();
  const results = [];
  
  for (const [username, user] of users.entries()) {
    if (username.toLowerCase().includes(query) || 
        user.displayName.toLowerCase().includes(query)) {
      results.push({
        username: user.username,
        displayName: user.displayName,
        isOnline: user.isOnline
      });
    }
  }
  
  res.json(results.slice(0, 10)); // Limit to 10 results
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // User authentication via socket
  socket.on('authenticate', (userData) => {
    const user = users.get(userData.username);
    if (user) {
      user.isOnline = true;
      user.socketId = socket.id;
      activeUsers.set(socket.id, user);
      socket.userId = user.userId;
      socket.username = user.username;
      
      // Join user to their personal room
      socket.join(user.userId);
      
      // Notify friends that user is online
      socket.broadcast.emit('user_online', {
        username: user.username,
        displayName: user.displayName
      });
      
      socket.emit('authenticated', { success: true });
    }
  });
  
  // One-to-one chat
  socket.on('private_message', (data) => {
    const { recipientUsername, message } = data;
    const sender = activeUsers.get(socket.id);
    
    if (!sender) return;
    
    const recipient = users.get(recipientUsername);
    if (!recipient) {
      socket.emit('error', { message: 'User not found' });
      return;
    }
    
    // Create or find private room
    const roomId = [sender.userId, recipient.userId].sort().join('_');
    socket.join(roomId);
    
    // Send message to room (both users)
    io.to(roomId).emit('private_message', {
      roomId,
      sender: sender.username,
      senderName: sender.displayName,
      message,
      timestamp: new Date().toISOString()
    });
    
    // If recipient is online, add them to room
    if (recipient.socketId) {
      io.sockets.sockets.get(recipient.socketId)?.join(roomId);
    }
  });
  
  // Group chat creation
  socket.on('create_group', (data) => {
    const { groupName, members } = data;
    const creator = activeUsers.get(socket.id);
    
    if (!creator) return;
    
    const groupId = uuidv4();
    const group = {
      id: groupId,
      name: groupName,
      admin: creator.username,
      members: [creator.username, ...members],
      createdAt: new Date().toISOString()
    };
    
    groupRooms.set(groupId, group);
    
    // Add all members to group room
    group.members.forEach(memberUsername => {
      const member = users.get(memberUsername);
      if (member && member.socketId) {
        io.sockets.sockets.get(member.socketId)?.join(groupId);
      }
    });
    
    // Notify group creation
    io.to(groupId).emit('group_created', {
      groupId,
      groupName,
      admin: creator.displayName,
      members: group.members
    });
  });
  
  // Group message
  socket.on('group_message', (data) => {
    const { groupId, message } = data;
    const sender = activeUsers.get(socket.id);
    
    if (!sender) return;
    
    const group = groupRooms.get(groupId);
    if (!group || !group.members.includes(sender.username)) {
      socket.emit('error', { message: 'Access denied' });
      return;
    }
    
    io.to(groupId).emit('group_message', {
      groupId,
      sender: sender.username,
      senderName: sender.displayName,
      message,
      timestamp: new Date().toISOString()
    });
  });
  
  // Add friend
  socket.on('add_friend', (data) => {
    const { friendUsername } = data;
    const user = activeUsers.get(socket.id);
    
    if (!user) return;
    
    const friend = users.get(friendUsername);
    if (!friend) {
      socket.emit('error', { message: 'User not found' });
      return;
    }
    
    // Add to friends list (both ways)
    if (!user.friends.includes(friendUsername)) {
      user.friends.push(friendUsername);
    }
    if (!friend.friends.includes(user.username)) {
      friend.friends.push(user.username);
    }
    
    socket.emit('friend_added', {
      username: friend.username,
      displayName: friend.displayName,
      isOnline: friend.isOnline
    });
    
    // Notify friend if online
    if (friend.socketId) {
      io.to(friend.socketId).emit('friend_request_accepted', {
        username: user.username,
        displayName: user.displayName
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isOnline = false;
      user.socketId = null;
      activeUsers.delete(socket.id);
      
      // Notify friends that user is offline
      socket.broadcast.emit('user_offline', {
        username: user.username
      });
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
server.listen(PORT, () => {
  console.log(`Iran Chat Server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
});