const { dbAsync } = require('../database');

class Message {
    static async create(messageData) {
        const { senderId, recipientId, groupId, message, messageType = 'text' } = messageData;
        
        // Validate required parameters
        if (!senderId || !message) {
            throw new Error('senderId and message are required');
        }
        
        const sql = `
            INSERT INTO messages (sender_id, recipient_id, group_id, message, message_type)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        // Convert undefined to null for database
        const params = [
            senderId, 
            recipientId || null, 
            groupId || null, 
            message, 
            messageType
        ];
        const result = await dbAsync.run(sql, params);
        
        return {
            id: result.id,
            senderId,
            recipientId,
            groupId,
            message,
            messageType,
            timestamp: new Date().toISOString(),
            isRead: false
        };
    }
    
    static async getPrivateMessages(userId1, userId2, limit = 50, offset = 0) {
        const sql = `
            SELECT m.*, 
                   s.username as sender_username, 
                   s.display_name as sender_display_name,
                   r.username as recipient_username,
                   r.display_name as recipient_display_name
            FROM messages m
            JOIN users s ON m.sender_id = s.user_id
            LEFT JOIN users r ON m.recipient_id = r.user_id
            WHERE (m.sender_id = ? AND m.recipient_id = ?) 
               OR (m.sender_id = ? AND m.recipient_id = ?)
            AND m.group_id IS NULL
            ORDER BY m.timestamp DESC
            LIMIT ? OFFSET ?
        `;
        
        const messages = await dbAsync.all(sql, [userId1, userId2, userId2, userId1, limit, offset]);
        return messages.reverse(); // Return in chronological order
    }
    
    static async getGroupMessages(groupId, limit = 50, offset = 0) {
        const sql = `
            SELECT m.*, 
                   u.username as sender_username, 
                   u.display_name as sender_display_name
            FROM messages m
            JOIN users u ON m.sender_id = u.user_id
            WHERE m.group_id = ?
            ORDER BY m.timestamp DESC
            LIMIT ? OFFSET ?
        `;
        
        const messages = await dbAsync.all(sql, [groupId, limit, offset]);
        return messages.reverse(); // Return in chronological order
    }
    
    static async markAsRead(messageIds) {
        if (!Array.isArray(messageIds) || messageIds.length === 0) return;
        
        const placeholders = messageIds.map(() => '?').join(',');
        const sql = `UPDATE messages SET is_read = 1 WHERE id IN (${placeholders})`;
        
        await dbAsync.run(sql, messageIds);
    }
    
    static async getUnreadCount(userId) {
        const sql = `
            SELECT COUNT(*) as count
            FROM messages
            WHERE recipient_id = ? AND is_read = 0
        `;
        
        const result = await dbAsync.get(sql, [userId]);
        return result.count;
    }
    
    static async getRecentConversations(userId, limit = 20) {
        const sql = `
            WITH recent_messages AS (
                SELECT 
                    CASE 
                        WHEN sender_id = ? THEN recipient_id 
                        ELSE sender_id 
                    END as other_user_id,
                    MAX(timestamp) as last_message_time,
                    message as last_message,
                    sender_id as last_sender_id
                FROM messages
                WHERE (sender_id = ? OR recipient_id = ?) AND group_id IS NULL
                GROUP BY other_user_id
            )
            SELECT 
                rm.*,
                u.username,
                u.display_name,
                u.is_online
            FROM recent_messages rm
            JOIN users u ON rm.other_user_id = u.user_id
            ORDER BY rm.last_message_time DESC
            LIMIT ?
        `;
        
        return await dbAsync.all(sql, [userId, userId, userId, limit]);
    }
    
    static async deleteMessage(messageId, userId) {
        // Only allow sender to delete their own messages
        const sql = 'DELETE FROM messages WHERE id = ? AND sender_id = ?';
        const result = await dbAsync.run(sql, [messageId, userId]);
        return result.changes > 0;
    }
    
    static async searchMessages(userId, searchQuery, limit = 50) {
        const sql = `
            SELECT m.*, 
                   s.username as sender_username, 
                   s.display_name as sender_display_name,
                   r.username as recipient_username,
                   r.display_name as recipient_display_name,
                   g.group_name
            FROM messages m
            JOIN users s ON m.sender_id = s.user_id
            LEFT JOIN users r ON m.recipient_id = r.user_id
            LEFT JOIN groups g ON m.group_id = g.group_id
            WHERE (m.sender_id = ? OR m.recipient_id = ? OR 
                   m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
                   AND m.message LIKE ?
            ORDER BY m.timestamp DESC
            LIMIT ?
        `;
        
        const searchPattern = `%${searchQuery}%`;
        return await dbAsync.all(sql, [userId, userId, userId, searchPattern, limit]);
    }
}

module.exports = Message;