#!/bin/bash
echo "Zastavuji Fakturace System..."
pm2 stop all
pm2 delete all
echo "Systém zastaven"