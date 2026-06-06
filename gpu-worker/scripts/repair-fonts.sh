#!/bin/bash
set -e
GREEN='\033[0;32m'
NC='\033[0m'
echo -e "${GREEN}Starting MINEEDIT FONT REPAIR...${NC}"

# Ensure wget is installed
sudo apt-get install -y wget fontconfig

install_font() {
    # $1 = Name, $2 = Dir, $3 = Filename, $4 = URL_Encoded_Filename
    local name=$1
    local dir=$2
    local file=$3
    local url_file=${4:-$3}

    sudo mkdir -p "/usr/share/fonts/truetype/$dir"
    local url="https://github.com/google/fonts/raw/main/ofl/$dir/$url_file"
    
    if wget -q -O "/usr/share/fonts/truetype/$dir/$file" "$url"; then
        echo -e "✅ $name downloaded"
    else
        echo -e "❌ $name failed ($url)"
    fi
}

echo -e "${GREEN}Retrying variable fonts with encoded URLs...${NC}"

install_font "Montserrat" "montserrat" "Montserrat[wght].ttf" "Montserrat%5Bwght%5D.ttf"
install_font "Nunito" "nunito" "Nunito[wght].ttf" "Nunito%5Bwght%5D.ttf"
install_font "Inter" "inter" "Inter[slnt,wght].ttf" "Inter%5Bslnt%2Cwght%5D.ttf"
install_font "Roboto" "roboto" "Roboto[wdth,wght].ttf" "Roboto%5Bwdth%2Cwght%5D.ttf"
install_font "Open Sans" "opensans" "OpenSans[wdth,wght].ttf" "OpenSans%5Bwdth%2Cwght%5D.ttf"
install_font "Raleway" "raleway" "Raleway[wght].ttf" "Raleway%5Bwght%5D.ttf"
install_font "Rubik" "rubik" "Rubik[wght].ttf" "Rubik%5Bwght%5D.ttf"
install_font "Oswald" "oswald" "Oswald[wght].ttf" "Oswald%5Bwght%5D.ttf"
install_font "Teko" "teko" "Teko[wght].ttf" "Teko%5Bwght%5D.ttf"
install_font "Exo 2" "exo2" "Exo2[ital,wght].ttf" "Exo2%5Bital%2Cwght%5D.ttf"
install_font "Orbitron" "orbitron" "Orbitron[wght].ttf" "Orbitron%5Bwght%5D.ttf"
install_font "Dosis" "dosis" "Dosis[wght].ttf" "Dosis%5Bwght%5D.ttf"
install_font "Fredoka" "fredoka" "Fredoka[wdth,wght].ttf" "Fredoka%5Bwdth%2Cwght%5D.ttf"
install_font "Comfortaa" "comfortaa" "Comfortaa[wght].ttf" "Comfortaa%5Bwght%5D.ttf"

# Retry Static failures
install_font "Permanent Marker" "permanentmarker" "PermanentMarker-Regular.ttf"
install_font "Satisfy" "satisfy" "Satisfy-Regular.ttf"

echo -e "${GREEN}Refreshing font cache...${NC}"
sudo fc-cache -f -v
echo -e "${GREEN}Repair complete!${NC}"
