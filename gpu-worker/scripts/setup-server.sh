#!/bin/bash

# MineEdit GPU Worker Server Setup Script
# For Hetzner AX102 or similar Ubuntu 22.04 server

set -e

echo "========================================"
echo "MineEdit GPU Worker Setup Script"
echo "========================================"

# Update system
echo "[1/8] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential tools
echo "[2/8] Installing essential tools..."
sudo apt install -y \
    build-essential \
    git \
    curl \
    wget \
    htop \
    unzip \
    jq

# Install NVIDIA drivers (if GPU present)
echo "[3/8] Checking for NVIDIA GPU..."
if lspci | grep -i nvidia > /dev/null; then
    echo "NVIDIA GPU detected, installing drivers..."
    sudo apt install -y nvidia-driver-535 nvidia-cuda-toolkit
    echo "Drivers installed. A reboot may be required."
else
    echo "No NVIDIA GPU detected, skipping driver installation."
fi

# Install FFmpeg
echo "[4/8] Installing FFmpeg..."
sudo apt install -y ffmpeg

# Verify FFmpeg installation
echo "FFmpeg version:"
ffmpeg -version | head -1

# Check for NVENC support
if ffmpeg -encoders 2>/dev/null | grep -q h264_nvenc; then
    echo "✓ NVENC hardware encoding available"
else
    echo "⚠ NVENC not available, will use CPU encoding (libx264)"
fi

# Install Node.js 20
echo "[5/8] Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Install PM2
echo "[6/8] Installing PM2..."
sudo npm install -g pm2

# Install fonts for subtitles
echo "[7/8] Installing fonts..."
sudo apt install -y \
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig

# Download and install Montserrat font (used in subtitles)
echo "Installing Montserrat font..."
sudo mkdir -p /usr/share/fonts/truetype/montserrat
cd /tmp
wget -q "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf" -O Montserrat-Bold.ttf
wget -q "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-ExtraBold.ttf" -O Montserrat-ExtraBold.ttf
sudo mv Montserrat-*.ttf /usr/share/fonts/truetype/montserrat/
sudo fc-cache -f -v

# Create directories
echo "[8/8] Creating directories..."
sudo mkdir -p /opt/mineedit-gpu-worker
sudo mkdir -p /tmp/mineedit-renders
sudo chmod 777 /tmp/mineedit-renders

# Set up firewall (optional but recommended)
echo "Setting up firewall..."
sudo ufw allow ssh
sudo ufw allow 22/tcp
sudo ufw --force enable

echo ""
echo "========================================"
echo "Setup complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Copy the gpu-worker folder to /opt/mineedit-gpu-worker/"
echo "2. cd /opt/mineedit-gpu-worker/gpu-worker"
echo "3. npm install"
echo "4. npm run build"
echo "5. cp .env.example .env"
echo "6. Edit .env with your Supabase credentials"
echo "7. pm2 start dist/index.js --name mineedit-worker"
echo "8. pm2 save && pm2 startup"
echo ""
echo "To check GPU status: nvidia-smi"
echo "To check worker logs: pm2 logs mineedit-worker"
