# Fakturace System - ÚSPĚŠNĚ SPUŠTĚN! 🚀

## Status systému: ✅ ONLINE

### Běžící služby:
- **Backend API:** http://localhost:3002 ✅
- **Frontend:** http://localhost:3030 ✅

### Health check:
```bash
curl http://localhost:3002/api/health
# Response: {"status":"OK","timestamp":"2025-08-03T18:20:09.059Z"}
```

### PM2 Status:
```
┌────┬───────────────────────┬─────────┬───────┬──────────┬────────┬───────────┐
│ id │ name                  │ version │ mode  │ pid      │ uptime │ status    │
├────┼───────────────────────┼─────────┼───────┼──────────┼────────┼───────────┤
│ 0  │ fakturace-backend     │ 1.0.0   │ fork  │ 107710   │ 7s     │ online    │
│ 1  │ fakturace-frontend    │ N/A     │ fork  │ 108037   │ 0s     │ online    │
└────┴───────────────────────┴─────────┴───────┴──────────┴────────┴───────────┘
```

### Přihlašovací údaje:
- **Email:** admin@fakturace.cz  
- **Heslo:** admin123

### Správa systému:
```bash
# Zobrazit logy
pm2 logs

# Zobrazit status
pm2 status

# Restart služeb
pm2 restart all

# Zastavit systém
./stop.sh
```

### ⚠️ Důležité:
Backend API běží na portu **3002**, frontend na **3030**. Ujistěte se, že tyto porty jsou otevřené ve firewallu.
