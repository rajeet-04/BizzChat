#!/bin/bash
# One-command AWS deployment script for BizChat backend
# Copy this entire command and paste into your AWS Lightsail terminal

set -euo pipefail

echo "🚀 BizChat Backend - AWS Deployment"
echo "===================================="

# Navigate to backend
cd ~/BizzChat/backend

# Kill existing PM2 processes
echo "📋 Stopping any existing processes..."
pm2 kill || true

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build
echo "🔨 Building backend..."
pnpm run build

# Create logs directory
mkdir -p logs

# Start with PM2
echo "🎯 Starting with PM2..."
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M

# Save PM2 config
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Clear old PM2 logs so verification reflects this deployment only
pm2 flush || true

# Verify
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Status:"
pm2 status
echo ""
echo "Logs (last 30 lines, non-streaming):"
pm2 logs bizchat-backend --lines 30 --nostream
echo ""
echo "Testing health endpoint:"
sleep 1
curl http://localhost:3000/api/health || echo "Health check failed"
echo ""
echo "🎉 Backend is running on http://20.205.47.92:3000"
