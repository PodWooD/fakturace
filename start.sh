#!/bin/bash
echo "Spouštím Fakturace System..."
pm2 start ecosystem.config.js
echo "Systém běží na:"
echo "  Frontend: http://localhost:3030"
echo "  Backend API: http://localhost:3029"
echo ""
echo "Pro zobrazení logů použijte: pm2 logs"
echo "Pro zastavení použijte: ./stop.sh"
