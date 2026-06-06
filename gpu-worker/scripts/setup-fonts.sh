#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Comprehensive Font Installation for MineEdit...${NC}"

# Update package list and install utilities
sudo apt-get update
sudo apt-get install -y wget fontconfig

# Helper function to install a font from Google Fonts GitHub
install_font() {
    local name=$1
    local dir=$2
    local file=$3
    
    echo -e "Installing ${name}..."
    sudo mkdir -p "/usr/share/fonts/truetype/$dir"
    
    # Try downloading
    if wget -q -O "/usr/share/fonts/truetype/$dir/$file" "https://github.com/google/fonts/raw/main/ofl/$dir/$file"; then
         echo -e "  ✅ $name downloaded."
    else
         echo -e "  ❌ Failed to download $name (check URL or font name)"
    fi
}

echo -e "${GREEN}Downloading fonts...${NC}"

# --- PRIMARY FONTS ---
install_font "Montserrat" "montserrat" "Montserrat[wght].ttf"
install_font "Nunito" "nunito" "Nunito[wght].ttf"
install_font "Poppins" "poppins" "Poppins-Bold.ttf"
install_font "Inter" "inter" "Inter[slnt,wght].ttf"
install_font "Roboto" "roboto" "Roboto[wdth,wght].ttf"
install_font "Open Sans" "opensans" "OpenSans[wdth,wght].ttf"
install_font "Lato" "lato" "Lato-Bold.ttf"
install_font "Raleway" "raleway" "Raleway[wght].ttf"

# --- DISPLAY / IMPACT ---
install_font "Oswald" "oswald" "Oswald[wght].ttf"
install_font "Bebas Neue" "bebasneue" "BebasNeue-Regular.ttf"
install_font "Anton" "anton" "Anton-Regular.ttf"
install_font "Bangers" "bangers" "Bangers-Regular.ttf"
install_font "Permanent Marker" "permanentmarker" "PermanentMarker-Regular.ttf"
install_font "Archivo Black" "archivoblack" "ArchivoBlack-Regular.ttf"
install_font "Russo One" "russoone" "RussoOne-Regular.ttf"
install_font "Black Ops One" "blackopsone" "BlackOpsOne-Regular.ttf"
install_font "Teko" "teko" "Teko[wght].ttf"
install_font "Righteous" "righteous" "Righteous-Regular.ttf"
install_font "Chakra Petch" "chakrapetch" "ChakraPetch-Bold.ttf"

# --- GAMING / TECH ---
install_font "Press Start 2P (Minecraft)" "pressstart2p" "PressStart2P-Regular.ttf"
install_font "VT323" "vt323" "VT323-Regular.ttf"
install_font "Orbitron" "orbitron" "Orbitron[wght].ttf"
install_font "Audiowide" "audiowide" "Audiowide-Regular.ttf"
install_font "Titillium Web" "titilliumweb" "TitilliumWeb-Bold.ttf"
install_font "Exo 2" "exo2" "Exo2[ital,wght].ttf"
install_font "Play" "play" "Play-Bold.ttf"
install_font "Rubik" "rubik" "Rubik[wght].ttf"
install_font "Source Sans Pro" "sourcesanspro" "SourceSansPro-Regular.ttf"

# --- FUN / ROUND ---
install_font "Dosis" "dosis" "Dosis[wght].ttf"
install_font "Bungee" "bungee" "Bungee-Regular.ttf"
install_font "Fredoka" "fredoka" "Fredoka[wdth,wght].ttf"
install_font "Comfortaa" "comfortaa" "Comfortaa[wght].ttf"
install_font "Comic Neue" "comicneue" "ComicNeue-Bold.ttf"

# --- HANDWRITING / SCRIPT ---
install_font "Pacifico" "pacifico" "Pacifico-Regular.ttf"
install_font "Lobster" "lobster" "Lobster-Regular.ttf"
install_font "Satisfy" "satisfy" "Satisfy-Regular.ttf"

# --- CLEAN UP & CACHE ---
echo -e "${GREEN}Refreshing font cache...${NC}"
sudo fc-cache -f -v

echo -e "${GREEN}Installation complete! Verifying...${NC}"
fc-list : family | grep -i "Press Start" || echo "Warning: Press Start 2P not found in list"

echo -e "${GREEN}All fonts ready.${NC}"
