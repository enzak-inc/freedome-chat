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
    database: process.env.DB_NAME || 'iran_chat_db',
    charset: 'utf8mb4',
    timezone: '+00:00',
    // Connection timeout settings
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    // Keep connections alive
    idleTimeout: 300000, // 5 minutes
    // Force connection validation
    typeCast: function (field, next) {
        if (field.type === 'TINY' && field.length === 1) {
            return (field.string() === '1');
        }
        return next();
    }
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
        queueLimit: 0,
        // Additional pool settings for stability
        maxIdle: 10,
        idleTimeout: 300000, // 5 minutes
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    });
    
    // Add pool event listeners for better error handling
    pool.on('connection', (connection) => {
        console.log('New MySQL connection established');
    });
    
    pool.on('error', (err) => {
        console.error('MySQL pool error:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('Recreating MySQL connection pool...');
            setTimeout(createPool, 2000);
        }
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
        
        // Test connection with retry
        let connection;
        let retries = 3;
        
        while (retries > 0) {
            try {
                connection = await pool.getConnection();
                console.log('Connected to MySQL database');
                break;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                console.log(`Connection failed, retrying... (${retries} retries left)`);
                await sleep(2000);
            }
        }
        
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

// Database async methods with retry logic
const dbAsync = {
    execute: async (sql, params = [], retries = 2) => {
        try {
            const [result] = await pool.execute(sql, params);
            return {
                id: result.insertId,
                changes: result.affectedRows,
                result
            };
        } catch (error) {
            console.error('Database execute error:', error);
            
            // Retry on connection errors
            if (retries > 0 && isConnectionError(error)) {
                console.log(`Retrying database execute (${retries} retries left)...`);
                await sleep(1000);
                return dbAsync.execute(sql, params, retries - 1);
            }
            
            throw error;
        }
    },
    
    get: async (sql, params = [], retries = 2) => {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows[0] || null;
        } catch (error) {
            console.error('Database get error:', error);
            
            // Retry on connection errors
            if (retries > 0 && isConnectionError(error)) {
                console.log(`Retrying database get (${retries} retries left)...`);
                await sleep(1000);
                return dbAsync.get(sql, params, retries - 1);
            }
            
            throw error;
        }
    },
    
    all: async (sql, params = [], retries = 2) => {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('Database all error:', error);
            
            // Retry on connection errors
            if (retries > 0 && isConnectionError(error)) {
                console.log(`Retrying database all (${retries} retries left)...`);
                await sleep(1000);
                return dbAsync.all(sql, params, retries - 1);
            }
            
            throw error;
        }
    },
    
    run: async (sql, params = [], retries = 2) => {
        return await dbAsync.execute(sql, params, retries);
    }
};

// Helper functions
function isConnectionError(error) {
    const connectionErrorCodes = [
        'ECONNRESET',
        'ECONNREFUSED', 
        'PROTOCOL_CONNECTION_LOST',
        'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
        'ETIMEDOUT'
    ];
    return connectionErrorCodes.includes(error.code);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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