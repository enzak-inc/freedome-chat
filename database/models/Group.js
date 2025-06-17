const { dbAsync } = require('../database');
const { v4: uuidv4 } = require('uuid');

class Group {
    static async create(groupData) {
        const { groupName, adminId, memberIds = [] } = groupData;
        
        // Generate group ID
        const groupId = uuidv4();
        
        // Create group
        const sql = 'INSERT INTO groups (group_id, group_name, admin_id) VALUES (?, ?, ?)';
        await dbAsync.run(sql, [groupId, groupName, adminId]);
        
        // Add admin as first member
        await this.addMember(groupId, adminId);
        
        // Add other members
        for (const memberId of memberIds) {
            await this.addMember(groupId, memberId);
        }
        
        return {
            groupId,
            groupName,
            adminId,
            createdAt: new Date().toISOString()
        };
    }
    
    static async findById(groupId) {
        const sql = `
            SELECT g.*, u.username as admin_username, u.display_name as admin_display_name
            FROM groups g
            JOIN users u ON g.admin_id = u.user_id
            WHERE g.group_id = ?
        `;
        return await dbAsync.get(sql, [groupId]);
    }
    
    static async addMember(groupId, userId) {
        const sql = 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)';
        
        try {
            await dbAsync.run(sql, [groupId, userId]);
            return true;
        } catch (error) {
            // Handle duplicate member
            if (error.message.includes('UNIQUE constraint failed')) {
                return true; // Already a member
            }
            throw error;
        }
    }
    
    static async removeMember(groupId, userId) {
        const sql = 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?';
        const result = await dbAsync.run(sql, [groupId, userId]);
        return result.changes > 0;
    }
    
    static async getMembers(groupId) {
        const sql = `
            SELECT u.user_id, u.username, u.display_name, u.is_online, gm.joined_at
            FROM group_members gm
            JOIN users u ON gm.user_id = u.user_id
            WHERE gm.group_id = ?
            ORDER BY gm.joined_at
        `;
        return await dbAsync.all(sql, [groupId]);
    }
    
    static async isMember(groupId, userId) {
        const sql = 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?';
        const result = await dbAsync.get(sql, [groupId, userId]);
        return !!result;
    }
    
    static async getUserGroups(userId) {
        const sql = `
            SELECT g.*, 
                   u.username as admin_username, 
                   u.display_name as admin_display_name,
                   (SELECT COUNT(*) FROM group_members WHERE group_id = g.group_id) as member_count
            FROM groups g
            JOIN users u ON g.admin_id = u.user_id
            JOIN group_members gm ON g.group_id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY g.created_at DESC
        `;
        return await dbAsync.all(sql, [userId]);
    }
    
    static async updateGroupName(groupId, newName, adminId) {
        const sql = 'UPDATE groups SET group_name = ? WHERE group_id = ? AND admin_id = ?';
        const result = await dbAsync.run(sql, [newName, groupId, adminId]);
        return result.changes > 0;
    }
    
    static async delete(groupId, adminId) {
        // Only admin can delete group
        const group = await this.findById(groupId);
        if (!group || group.admin_id !== adminId) {
            return false;
        }
        
        // Delete group members first (due to foreign key constraint)
        await dbAsync.run('DELETE FROM group_members WHERE group_id = ?', [groupId]);
        
        // Delete the group
        await dbAsync.run('DELETE FROM groups WHERE group_id = ?', [groupId]);
        
        // Note: Messages are kept for history
        return true;
    }
    
    static async transferAdmin(groupId, currentAdminId, newAdminId) {
        // Verify current admin and new admin is a member
        const isMember = await this.isMember(groupId, newAdminId);
        if (!isMember) {
            return false;
        }
        
        const sql = 'UPDATE groups SET admin_id = ? WHERE group_id = ? AND admin_id = ?';
        const result = await dbAsync.run(sql, [newAdminId, groupId, currentAdminId]);
        return result.changes > 0;
    }
    
    static async getGroupInfo(groupId, userId) {
        // Get group details if user is a member
        const isMember = await this.isMember(groupId, userId);
        if (!isMember) {
            return null;
        }
        
        const group = await this.findById(groupId);
        if (!group) {
            return null;
        }
        
        const members = await this.getMembers(groupId);
        
        return {
            ...group,
            members,
            memberCount: members.length,
            isAdmin: group.admin_id === userId
        };
    }
}

module.exports = Group;