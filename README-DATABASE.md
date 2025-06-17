# Database Setup Guide

This document explains how to set up the MySQL database for the Iran Chat App.

## Prerequisites

- MySQL Server installed and running
- Node.js and npm installed
- Project dependencies installed (`npm install`)

## Quick Setup

### 1. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your MySQL credentials:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=iran_chat_db
```

### 2. Deploy Database Schema

Choose one of these methods:

#### Method A: Automatic Setup (Recommended)

```bash
npm run setup-db
```

This script will:
- Connect to your MySQL server
- Create the database if it doesn't exist
- Create all required tables
- Show a summary of created tables

#### Method B: Start Application (Auto-Deploy)

```bash
npm start
```

The application automatically creates the database and tables on first run.

#### Method C: Manual MySQL Command

```bash
mysql -u root -p < database/init.sql
```

## Database Schema

The application creates these tables:

- **users** - User accounts and profiles
- **friends** - Friend relationships
- **messages** - Chat messages (private and group)
- **groups** - Group chat information
- **group_members** - Group membership

## Troubleshooting

### Connection Issues

**Error: Access denied**
- Check your MySQL username and password in `.env`
- Ensure the MySQL user has proper permissions

**Error: Connection refused**
- Make sure MySQL server is running
- Check the host and port in `.env`

**Error: Database doesn't exist**
- The setup script will create it automatically
- Or create manually: `CREATE DATABASE iran_chat_db;`

### Permission Issues

Grant necessary permissions to your MySQL user:

```sql
GRANT ALL PRIVILEGES ON iran_chat_db.* TO 'your_user'@'localhost';
FLUSH PRIVILEGES;
```

### Reset Database

To recreate all tables:

```bash
npm run reset-db
```

## Manual Database Creation

If you prefer to create the database manually:

```sql
-- Login to MySQL
mysql -u root -p

-- Create database
CREATE DATABASE iran_chat_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use database
USE iran_chat_db;

-- Execute schema
SOURCE /path/to/your/project/database/init.sql;
```

## Verification

To verify the setup worked:

```sql
USE iran_chat_db;
SHOW TABLES;
```

You should see: `users`, `friends`, `messages`, `groups`, `group_members`