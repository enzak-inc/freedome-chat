const { dbAsync } = require('../database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

class User {
    static async create(userData) {
        const { username, displayName, password, baseUrl } = userData;
        
        // Generate user ID
        const userId = uuidv4();
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);
        
        // Generate shareable link
        const shareableLink = `http://${baseUrl}${username}`;
        
        // Generate QR code
        const qrCodeData = JSON.stringify({
            username,
            displayName,
            shareableLink,
            userId
        });
        const qrCode = await QRCode.toDataURL(qrCodeData);
        
        // Insert user into database
        const sql = `
            INSERT INTO users (username, display_name, password_hash, user_id, qr_code, shareable_link)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        await dbAsync.run(sql, [username, displayName, passwordHash, userId, qrCode, shareableLink]);
        
        return {
            username,
            displayName,
            userId,
            qrCode,
            shareableLink,
            createdAt: new Date().toISOString(),
            isOnline: false
        };
    }
    
    static async findByUsername(username) {
        const sql = 'SELECT * FROM users WHERE username = ?';
        return await dbAsync.get(sql, [username]);
    }
    
    static async findByUserId(userId) {
        const sql = 'SELECT * FROM users WHERE user_id = ?';
        return await dbAsync.get(sql, [userId]);
    }
    
    static async validatePassword(username, password) {
        const user = await this.findByUsername(username);
        if (!user) return null;
        
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return null;
        
        // Return user without password hash
        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    
    static async updateOnlineStatus(userId, isOnline) {
        const sql = 'UPDATE users SET is_online = ? WHERE user_id = ?';
        await dbAsync.run(sql, [isOnline ? 1 : 0, userId]);
    }
    
    static async search(query, limit = 10) {
        const sql = `
            SELECT username, display_name, is_online 
            FROM users 
            WHERE username LIKE ? OR display_name LIKE ?
            LIMIT ?
        `;
        const searchPattern = `%${query}%`;
        return await dbAsync.all(sql, [searchPattern, searchPattern, limit]);
    }
    
    static async exists(username) {
        const sql = 'SELECT 1 FROM users WHERE username = ?';
        const result = await dbAsync.get(sql, [username]);
        return !!result;
    }
    
    // Friend-related methods
    static async addFriend(userId, friendId) {
        try {
            // Check if friendship already exists
            const existingFriendship = await this.isFriend(userId, friendId);
            if (existingFriendship) {
                console.log('Friendship already exists');
                return true; // Already friends
            }
            
            const sql = `
                INSERT INTO friends (user_id, friend_id, status)
                VALUES (?, ?, 'accepted')
            `;
            
            // Add bidirectional friendship
            await dbAsync.run(sql, [userId, friendId]);
            await dbAsync.run(sql, [friendId, userId]);
            return true;
        } catch (error) {
            // Handle duplicate friendship (MySQL error)
            if (error.code === 'ER_DUP_ENTRY') {
                console.log('Duplicate friendship detected, friendship already exists');
                return true; // Already friends
            }
            console.error('Add friend error:', error);
            throw error;
        }
    }
    
    static async getFriends(userId) {
        const sql = `
            SELECT u.username, u.display_name, u.is_online, u.user_id
            FROM friends f
            JOIN users u ON f.friend_id = u.user_id
            WHERE f.user_id = ? AND f.status = 'accepted'
            ORDER BY u.display_name
        `;
        return await dbAsync.all(sql, [userId]);
    }
    
    static async isFriend(userId, friendId) {
        const sql = `
            SELECT 1 FROM friends 
            WHERE user_id = ? AND friend_id = ? AND status = 'accepted'
        `;
        const result = await dbAsync.get(sql, [userId, friendId]);
        return !!result;
    }
    
    static async removeFriend(userId, friendId) {
        const sql = 'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)';
        await dbAsync.run(sql, [userId, friendId, friendId, userId]);
    }
    
    static async getPublicProfile(username) {
        const sql = `
            SELECT username, display_name, shareable_link, qr_code, is_online
            FROM users WHERE username = ?
        `;
        return await dbAsync.get(sql, [username]);
    }
}

module.exports = User;