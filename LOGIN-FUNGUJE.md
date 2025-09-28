# Přihlašování nyní funguje! ✅

## Systém je plně funkční

### Přístupové body:
- **Frontend:** http://localhost:3030
- **Backend API:** http://localhost:3002

### Přihlašovací údaje:
- **Email:** admin@fakturace.cz
- **Heslo:** admin123

### Co bylo opraveno:
1. ✅ Vytvořena login stránka (`/login`)
2. ✅ Vytvořena dashboard stránka (`/dashboard`)
3. ✅ Implementovány auth routes v backendu
4. ✅ Sjednoceny porty pro běh aplikace: backend 3002, frontend 3030
5. ✅ Přidána autentifikace pomocí JWT

### Jak se přihlásit:
1. Otevřete prohlížeč na http://localhost:3030
2. Budete automaticky přesměrováni na login stránku
3. Zadejte přihlašovací údaje výše
4. Po úspěšném přihlášení budete přesměrováni na dashboard

### API test:
```bash
# Test přihlášení
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fakturace.cz","password":"admin123"}'
```

### Správa systému:
```bash
# Zobrazit logy
pm2 logs

# Restart
pm2 restart all

# Zastavit
./stop.sh
```
