#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBmYWt0dXJhY2UuY3oiLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3NTQzMTQ3MjQsImV4cCI6MTc1NDQwMTEyNH0.XWy2TvCtf-zoUTvVe9DFx4QVBzYdnuTqGUDWDH4iVwQ"

echo "======================================"
echo "FAKTURACE SYSTEM - DATABÁZOVÁ DATA"
echo "======================================"
echo ""

echo "1. ORGANIZACE:"
echo "--------------"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/organizations | python3 -m json.tool
echo ""

echo "2. PRACOVNÍ ZÁZNAMY:"
echo "--------------------"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/work-records | python3 -m json.tool
echo ""

echo "3. SLUŽBY:"
echo "----------"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/services | python3 -m json.tool
echo ""

echo "4. HARDWARE:"
echo "------------"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/hardware | python3 -m json.tool
echo ""

echo "5. FAKTURY:"
echo "-----------"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/invoices | python3 -m json.tool
echo ""

echo "6. SOUHRNNÉ STATISTIKY:"
echo "------------------------"
# Získat dostupné měsíce
echo "Dostupné měsíce:"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/work-records/available-months | python3 -m json.tool

# Získat souhrn pro aktuální měsíc
echo ""
echo "Souhrn za aktuální měsíc:"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3029/api/work-records/summary/2025/8 | python3 -m json.tool
