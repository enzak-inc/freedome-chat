# Production Deployment Guide

## Quick Fix for 502 Bad Gateway

### 1. Check if app is running
```bash
# Check if app is running on port 3000
curl http://localhost:3000
```

### 2. Update Nginx configuration
```bash
# Edit your Nginx site configuration
sudo nano /etc/nginx/sites-available/2dev-admin.telo.md

# Or copy the example config
sudo cp nginx-config.example /etc/nginx/sites-available/freedome-chat
sudo ln -s /etc/nginx/sites-available/freedome-chat /etc/nginx/sites-enabled/
```

### 3. Test and reload Nginx
```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 4. Use PM2 for production (recommended)
```bash
# Install PM2
npm install -g pm2

# Start app with PM2
pm2 start server.js --name freedome-chat

# Save PM2 configuration
pm2 save
pm2 startup

# View logs
pm2 logs freedome-chat
```

## Alternative: Run on different port

If you can't modify Nginx, run the app on port 80:

```bash
# Update .env file
echo "PORT=80" >> .env

# Run with sudo (required for port 80)
sudo npm start
```

## Check application status

```bash
# Check if app is running
pm2 status

# Check Node.js process
ps aux | grep node

# Check port 3000
netstat -tlnp | grep 3000

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## Common Issues

### 502 Bad Gateway
- App not running on expected port
- Nginx proxy_pass pointing to wrong port
- Firewall blocking local connections

### WebSocket Issues
- Missing WebSocket headers in Nginx
- Proxy timeout too short

### SSL Issues
- Incorrect certificate paths
- Mixed content (HTTP resources on HTTPS page)