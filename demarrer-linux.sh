#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo "  Touba Quincaillerie Sarr & Frère - démarrage en cours..."
echo "============================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "ERREUR : Node.js n'est pas installé sur cet ordinateur."
    echo "Téléchargez-le sur https://nodejs.org puis relancez ce fichier."
    echo ""
    read -p "Appuyez sur Entrée pour fermer..."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Première installation, patientez quelques instants..."
    npm install
    echo ""
fi

echo "L'application va s'ouvrir dans votre navigateur."
echo "Pour arrêter l'application, fermez cette fenêtre de terminal."
echo ""

export APP_PASSWORD=modou2002
( sleep 1.5 && xdg-open http://localhost:3001 ) &
node server.js
