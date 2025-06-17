const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = path.join(__dirname, 'chat.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize database with schema
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // Read the init.sql file
        fs.readFile(INIT_SQL_PATH, 'utf8', (err, sql) => {
            if (err) {
                console.error('Error reading init.sql:', err);
                reject(err);
                return;
            }

            // Execute the SQL commands
            db.exec(sql, (err) => {
                if (err) {
                    console.error('Error initializing database:', err);
                    reject(err);
                    return;
                }
                console.log('Database initialized successfully');
                resolve();
            });
        });
    });
}

// Promisified database methods
const dbAsync = {
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },
    
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    
    all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

// Export database and helper functions
module.exports = {
    db,
    dbAsync,
    initializeDatabase
};