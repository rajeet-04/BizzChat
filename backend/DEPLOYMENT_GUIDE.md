# AWS Lightsail Deployment Guide

## Quick Setup on AWS Lightsail VM

### 1. Initial Setup (SSH into VM)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm globally
npm install -g pnpm

# Clone repo (if not already cloned)
cd /home/ubuntu
git clone https://github.com/rajeet-04/BizzChat.git
cd BizzChat
```

### 2. Install Dependencies & Build

```bash
cd backend

# Install dependencies
pnpm install

# Build
pnpm run build
```

### 3. Setup PM2 for Process Management

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start with PM2
pnpm run start:pm2

# Save PM2 process list (auto-restart on reboot)
pm2 save
sudo pm2 startup

# View logs
pnpm run pm2:logs

# Status
pm2 status
```

### 4. Verify Health Endpoint

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Response should be 200
{
  "status": "ok",
  "timestamp": "2026-04-23T...",
  "services": {
    "database": "ok",
    "ollama": "ok"
  }
}
```

## Key Improvements Made

✅ **Health endpoint** - Lightweight (no DB writes), 5-second timeout
✅ **Error handling** - Tracks uncaught exceptions, auto-restarts after 10 errors
✅ **PM2 config** - Auto-restart on crash, daily memory resets, 512MB max memory
✅ **Graceful shutdown** - 10-second timeout for clean shutdown

## Monitoring & Troubleshooting

### View logs
```bash
pm2 logs                    # Real-time logs
pm2 logs --lines 200        # Last 200 lines
pm2 logs --err              # Error logs only
```

### Check process health
```bash
pm2 status
pm2 monit                   # Top-like monitoring
```

### Restart process
```bash
pnpm run pm2:restart
# or
pm2 restart bizchat-backend
```

### Stop process
```bash
pnpm run pm2:stop
# or
pm2 stop all
```

## Health Check Endpoint

**Endpoint:** `http://52.66.154.194:3000/api/health`

The health endpoint now:
- ✅ Returns 200 with `status: "ok"` if healthy
- ✅ Returns 503 with `status: "error"` if unhealthy
- ✅ Has 5-second timeout (prevents hanging)
- ✅ Doesn't write to Firestore (lightweight check)
- ✅ Reports Ollama service status

## Common Issues & Fixes

### "Connection refused" after restart
```bash
# Logs full stack trace
pm2 logs
# Usually a missing env var or config issue
```

### Memory keeps growing
```bash
# Check memory usage
pm2 monit

# PM2 will auto-restart at 512MB
# Or manually restart daily via cron
```

### Health check keeps failing
```bash
# Check if backend is running
pm2 status

# Check logs
pm2 logs

# Test manually
curl http://localhost:3000/api/health
```

## Nginx Reverse Proxy (Optional but Recommended)

To expose on port 80/443:

```bash
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/bizchat
```

```nginx
server {
    listen 80;
    server_name 52.66.154.194;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/bizchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Next Steps

1. ✅ Build: `cd backend && pnpm run build`
2. ✅ Deploy: `pnpm run start:pm2`
3. ✅ Test: `curl http://52.66.154.194:3000/api/health`
4. ✅ Monitor: `pm2 logs`
