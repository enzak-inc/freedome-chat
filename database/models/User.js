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
        console.log(`[DB] Looking up user by username: ${username}`);
        const sql = 'SELECT * FROM users WHERE username = ?';
        try {
            const result = await dbAsync.get(sql, [username]);
            console.log(`[DB] User lookup result: ${result ? 'Found' : 'Not found'}`);
            return result;
        } catch (error) {
            console.error(`[DB] Error finding user ${username}:`, error);
            throw error;
        }
    }
    
    static async findByUserId(userId) {
        const sql = 'SELECT * FROM users WHERE user_id = ?';
        return await dbAsync.get(sql, [userId]);
    }
    
    static async validatePassword(username, password) {
        console.log(`[AUTH] Validating password for user: ${username}`);
        
        try {
            const user = await this.findByUsername(username);
            console.log(`[AUTH] User found in database: ${user ? 'Yes' : 'No'}`);
            
            if (!user) {
                console.log(`[AUTH] User ${username} not found in database`);
                return null;
            }
            
            console.log(`[AUTH] User data retrieved: userId=${user.user_id}, created=${user.created_at}`);
            
            const isValid = await bcrypt.compare(password, user.password_hash);
            console.log(`[AUTH] Password validation result: ${isValid}`);
            
            if (!isValid) {
                console.log(`[AUTH] Invalid password for user ${username}`);
                return null;
            }
            
            // Return user without password hash
            const { password_hash, ...userWithoutPassword } = user;
            console.log(`[AUTH] Authentication successful for user ${username}`);
            return userWithoutPassword;
        } catch (error) {
            console.error(`[AUTH] Error validating password for ${username}:`, error);
            throw error;
        }
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
        console.log(`[DB] Checking if user exists: ${username}`);
        const sql = 'SELECT 1 FROM users WHERE username = ?';
        try {
            const result = await dbAsync.get(sql, [username]);
            const exists = !!result;
            console.log(`[DB] User ${username} exists: ${exists}`);
            return exists;
        } catch (error) {
            console.error(`[DB] Error checking if user ${username} exists:`, error);
            throw error;
        }
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