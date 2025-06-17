require('dotenv').config();
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Database configuration
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'freedom_chat',
    charset: 'utf8mb4',
    timezone: '+00:00'
};

const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Connection pool
let pool;

// Initialize connection pool
function createPool() {
    pool = mysql.createPool({
        ...DB_CONFIG,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    
    console.log('MySQL connection pool created');
    return pool;
}

// Initialize database with schema
async function initializeDatabase() {
    try {
        // Create connection pool
        if (!pool) {
            createPool();
        }
        
        // Test connection
        const connection = await pool.getConnection();
        console.log('Connected to MySQL database');
        
        // Read and execute the init.sql file
        const sql = fs.readFileSync(INIT_SQL_PATH, 'utf8');
        
        // Split SQL statements by semicolon and execute each one
        const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
        
        for (const statement of statements) {
            if (statement.trim()) {
                await connection.execute(statement);
            }
        }
        
        connection.release();
        console.log('Database initialized successfully');
        
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Database async methods
const dbAsync = {
    execute: async (sql, params = []) => {
        try {
            const [result] = await pool.execute(sql, params);
            return {
                id: result.insertId,
                changes: result.affectedRows,
                result
            };
        } catch (error) {
            console.error('Database execute error:', error);
            throw error;
        }
    },
    
    get: async (sql, params = []) => {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows[0] || null;
        } catch (error) {
            console.error('Database get error:', error);
            throw error;
        }
    },
    
    all: async (sql, params = []) => {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('Database all error:', error);
            throw error;
        }
    },
    
    run: async (sql, params = []) => {
        return await dbAsync.execute(sql, params);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    if (pool) {
        await pool.end();
        console.log('MySQL connection pool closed');
    }
    process.exit(0);
});

// Export database and helper functions
module.exports = {
    pool,
    dbAsync,
    initializeDatabase,
    createPool
};