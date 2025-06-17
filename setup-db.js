#!/usr/bin/env node

/**
 * Database Setup Script for Iran Chat App
 * This script sets up the MySQL database and tables
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    multipleStatements: true
};

async function setupDatabase() {
    let connection;
    
    try {
        console.log('🔌 Connecting to MySQL server...');
        
        // Connect to MySQL server (without specifying database)
        connection = await mysql.createConnection(DB_CONFIG);
        
        console.log('✅ Connected to MySQL server');
        
        // Create database if it doesn't exist
        const dbName = process.env.DB_NAME || 'iran_chat_db';
        console.log(`🗄️  Creating database: ${dbName}`);
        await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.execute(`USE ${dbName}`);
        
        // Read the schema file (try MariaDB version first, then fallback to MySQL)
        let schemaPath = path.join(__dirname, 'database', 'init-mariadb.sql');
        if (!fs.existsSync(schemaPath)) {
            schemaPath = path.join(__dirname, 'database', 'init.sql');
        }
        const schema = fs.readFileSync(schemaPath, 'utf8');
        console.log(`📄 Using schema: ${path.basename(schemaPath)}`);
        console.log(`📄 Schema file size: ${schema.length} characters`);
        
        console.log('📄 Executing database schema...');
        
        // Split SQL statements and execute them one by one
        const allStatements = schema.split(';');
        console.log(`📋 Raw statements after split: ${allStatements.length}`);
        
        const statements = allStatements
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        console.log('📋 First few statements:');
        statements.slice(0, 3).forEach((stmt, i) => {
            console.log(`${i + 1}: ${stmt.substring(0, 100)}...`);
        });
        
        console.log(`📋 Found ${statements.length} SQL statements to execute`);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            if (statement) {
                try {
                    console.log(`⚡ Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
                    const result = await connection.execute(statement);
                    console.log(`✅ Statement ${i + 1} executed successfully`);
                } catch (error) {
                    console.log(`❌ Statement ${i + 1} failed: ${statement.substring(0, 100)}...`);
                    console.log(`❌ Error: ${error.message}`);
                    // Continue with other statements
                }
            }
        }
        
        console.log('✅ Database schema executed successfully!');
        console.log('🎉 Database setup completed!');
        
        // Verify tables were created
        const [tables] = await connection.execute('SHOW TABLES');
        
        console.log('\n📋 Created tables:');
        if (tables.length === 0) {
            console.log('  ⚠️  No tables found! Check for errors above.');
        } else {
            tables.forEach(table => {
                const tableName = Object.values(table)[0];
                console.log(`  ✓ ${tableName}`);
            });
        }
        
        console.log(`\n📊 Total tables: ${tables.length}`);
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('💡 Check your MySQL credentials in the .env file');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('💡 Make sure MySQL server is running');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('💡 Database does not exist, it will be created automatically');
        }
        
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 MySQL connection closed');
        }
    }
}

// Check if .env file exists
if (!fs.existsSync('.env')) {
    console.error('❌ .env file not found!');
    console.log('💡 Please create a .env file based on .env.example');
    process.exit(1);
}

// Check required environment variables
const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.log('💡 Please check your .env file');
    process.exit(1);
}

console.log('🚀 Starting database setup...');
console.log(`📍 Target: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

setupDatabase();