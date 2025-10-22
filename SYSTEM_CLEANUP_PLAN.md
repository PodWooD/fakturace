# Analýza a plán úklidu systému Claude Code + browsermcp

**Datum:** 2025-10-20
**Status:** ⚠️ KRITICKÝ BORDEL - vyžaduje čištění

---

## 📊 SOUHRN PROBLÉMŮ

### Kritické problémy:
1. **Duplikované běžící procesy** - browsermcp běží 2x (port 3029 + 5555)
2. **Konflikty konfigurací** - konfigurace na 5+ místech
3. **Duplicitní instalace** - browsermcp na 2 místech (86M + 144M)
4. **Nepořádek v zálohách** - 4 zálohy bez popisu
5. **Přeplněný cache** - 234M v ~/.claude (135 todo souborů!)

---

## 🔍 DETAILNÍ ANALÝZA

### 1. KONFIGURACE CLAUDE CODE

#### Problém: Fragmentované konfigurace
```
Lokace:
├── ~/.claude.json (46274 tokenů! OBŘÍ soubor)
├── ~/.config/claude/config.json (Desktop konfigurace)
├── ~/.config/claude-code/config.json (CLI konfigurace)
├── ~/.claude/mcp_servers.json (prázdný - {})
├── ~/.claude/settings.json
├── ~/.claude/settings.local.json
└── ~/project/fakturace/.claude/settings.local.json
```

**Konflikty:**
- Desktop vs CLI konfigurace mají různé MCP servery
- `~/.claude.json` je OBŘÍ (46k tokenů) kvůli historii konverzací
- Projekty mají vlastní konfigurace (fakturace, voiceavr, voicebotopen)

**Doporučení:**
- ✅ **PONECHAT:** `~/.claude.json` (hlavní CLI config)
- ✅ **PONECHAT:** `~/project/fakturace/.claude/settings.local.json`
- ❌ **SMAZAT:** `~/.claude/mcp_servers.json` (prázdný)
- ⚠️ **ARCHIVOVAT:** Desktop konfigurace (pokud Desktop nepoužíváš)

---

### 2. BROWSERMCP INSTALACE

#### Problém: Duplikované instalace + běžící procesy

```
Instalace:
├── /home/noreason/browsermcp-enhanced (144M) - VÝVOJOVÁ VERZE
├── ~/.local/lib/browsermcp-enhanced (86M) - PRODUKČNÍ VERZE
├── ~/.local/backups/browsermcp-enhanced (záloha)
└── ~/.config/browsermcp (konfigurace)

Běžící procesy:
├── PID 932206: node index-http.js --port 5555 ✅ SPRÁVNĚ (systemd)
├── PID 932205: node websocket-daemon.js ✅ SPRÁVNĚ (systemd)
└── PID 932229: node index-http.js --port 3029 ❌ ŠPATNĚ! (ruční start)

Systemd služby:
├── browsermcp-http.service ✅ enabled, running (port 5555)
└── browsermcp-daemon.service ✅ enabled, running (port 8765)

System konfigurace:
├── /etc/default/browsermcp ✅ port 5555
├── /etc/default/browsermcp.backup-20251020-221919
└── /etc/systemd/system/browsermcp-*.service (2 služby)
```

**Konflikty:**
- PID 932229 běží na portu 3029 (konflikt s fakturačním backendem!)
- Dvě instalace (vývojová 144M + produkční 86M)

**Doporučení:**
- ❌ **ZABÍT:** PID 932229 (ruční proces na portu 3029)
- ⚠️ **ROZHODNOUT:** Ponechat vývojovou (`~/browsermcp-enhanced`) nebo jen produkční?
- ✅ **PONECHAT:** Systemd služby (fungují správně)
- ❌ **SMAZAT:** `~/.local/backups/browsermcp-enhanced` (stará záloha)
- ❌ **SMAZAT:** `/etc/default/browsermcp.backup-*` (záloha už není potřeba)

---

### 3. MCP SERVERY

```
Aktuální konfigurace v ~/.claude.json:

Projekty s MCP servery:
├── /home/noreason
│   └── browsermcp: http://127.0.0.1:5555/mcp (SSE)
└── /home/noreason/project/fakturace
    └── browsermcp: http://127.0.0.1:5555/mcp (SSE)

Globální MCP servery (Desktop):
├── ~/.config/claude/config.json
│   ├── sage: /home/noreason/sage-mcp/venv/bin/python
│   └── browsermcp: http://127.0.0.1:5555/mcp (SSE)
└── ~/.config/claude-code/config.json
    ├── sage: /home/noreason/sage-mcp/venv/bin/python
    └── browsermcp: http://127.0.0.1:5555/mcp (SSE)

Další MCP config:
└── ~/.codex/mcp-config.json (???)
```

**Doporučení:**
- ✅ **SJEDNOTIT:** Všechny browsermcp konfigurace ukazují správně na port 5555
- ⚠️ **ZKONTROLOVAT:** `~/.codex/mcp-config.json` - k čemu slouží?
- ✅ **PONECHAT:** sage MCP (funguje)

---

### 4. CACHE A LOGY

```
Cache (~/.cache/claude-cli-nodejs):
├── -home-noreason (336K) - hlavní projekt
├── -home-noreason-project-fakturace (92K) - tento projekt
├── -home-noreason-project-voicebotopen (112K)
├── -home-noreason-project-voiceavr (16K)
├── -home-noreason-Music (12K) - ??? Proč Music?
├── -home-noreason-project (12K)
└── -home-noreason-browsermcp-enhanced (12K)

Logy v každém projektu:
├── mcp-logs-browsermcp/
├── mcp-logs-sage/
└── mcp-logs-laskobot/ (jen v /home/noreason - STARÝ!)

Claude data (~/.claude):
├── todos/ - 135 souborů!
├── history.jsonl - 117KB
├── file-history/ - 40 adresářů
├── projects/ - 9 adresářů
├── session-env/ - 17 adresářů
├── debug/ - 12288 souborů!
└── CELKEM: 234M
```

**Problémy:**
- `~/.claude/debug/` má 12288 souborů!
- 135 todo JSON souborů (staré sessions)
- Logy pro "laskobot" (starý název browsermcp)
- Cache pro Music projekt (???)

**Doporučení:**
- ❌ **SMAZAT:** `~/.claude/debug/` (pokud není potřeba)
- ❌ **SMAZAT:** Staré todo soubory (> 30 dní)
- ❌ **SMAZAT:** `mcp-logs-laskobot/` (přejmenováno na browsermcp)
- ⚠️ **VYČISTIT:** Cache starší než 30 dní

---

### 5. ZÁLOHY

```
Zálohy konfigurace:
├── ~/.claude-backup-20251020-221427/ (dnešní)
├── ~/.claude-backup-20251020-221440/ (dnešní)
├── ~/.claude.json.backup (bez data!)
├── ~/.claude.json.backup-20251020-221948 (dnešní)
└── ~/backups/2025-10-01/claude-config/ (starší)
```

**Problémy:**
- 3 zálohy vytvořené dnes (během oprav)
- Zálohy bez časového razítka
- Staré zálohy v různých adresářích

**Doporučení:**
- ✅ **PONECHAT:** Nejnovější zálohu (20251020-221948)
- ❌ **SMAZAT:** Starší dnešní zálohy
- ⚠️ **ARCHIVOVAT:** `~/backups/2025-10-01/` (pokud není potřeba)

---

## 📋 PLÁN ČIŠTĚNÍ

### FÁZE 1: KRITICKÉ OPRAVY (OKAMŽITĚ)

#### 1.1 Zastavit duplikovaný browsermcp proces
```bash
# Zabít ruční proces na portu 3029
kill 932229

# Ověřit že běží jen systemd procesy
ps aux | grep browsermcp
# Měly by být jen 2: daemon (8765) + http (5555)
```

#### 1.2 Najít původ ručního procesu
```bash
# Zkontrolovat crontab
crontab -l

# Zkontrolovat systemd user services
systemctl --user list-units --type=service | grep mcp

# Zkontrolovat autostart
ls ~/.config/autostart/
```

---

### FÁZE 2: ČIŠTĚNÍ KONFIGURACE (BEZPEČNÉ)

#### 2.1 Smazat prázdné/duplicitní konfigurace
```bash
# Prázdný MCP servers config
rm ~/.claude/mcp_servers.json

# Staré zálohy (ponechat nejnovější)
rm -rf ~/.claude-backup-20251020-221427/
rm -rf ~/.claude-backup-20251020-221440/
rm ~/.claude.json.backup  # bez časového razítka

# Systémová záloha browsermcp (už není potřeba)
sudo rm /etc/default/browsermcp.backup-20251020-221919
```

#### 2.2 Rozhodnout o Desktop konfiguraci
```bash
# POKUD NEPOUŽÍVÁŠ CLAUDE DESKTOP:
# Archivovat konfigurace
mkdir -p ~/archive/claude-desktop-configs
mv ~/.config/claude/ ~/archive/claude-desktop-configs/
mv ~/.config/claude-code/ ~/archive/claude-desktop-configs/

# POKUD POUŽÍVÁŠ CLAUDE DESKTOP:
# Nechat beze změny
```

---

### FÁZE 3: ČIŠTĚNÍ CACHE A LOGŮ (VOLITELNÉ)

#### 3.1 Vyčistit staré debug logy
```bash
# POZOR: Smazat jen pokud není potřeba pro debugging!
rm -rf ~/.claude/debug/*

# Nebo ponechat jen nové (poslední týden)
find ~/.claude/debug/ -type f -mtime +7 -delete
```

#### 3.2 Vyčistit staré todo soubory
```bash
# Smazat todo soubory starší než 30 dní
find ~/.claude/todos/ -type f -mtime +30 -delete
```

#### 3.3 Vyčistit staré MCP logy
```bash
# Smazat staré "laskobot" logy
rm -rf ~/.cache/claude-cli-nodejs/-home-noreason/mcp-logs-laskobot/

# Vyčistit staré log soubory (> 7 dní)
find ~/.cache/claude-cli-nodejs/ -name "*.txt" -mtime +7 -delete
```

#### 3.4 Vyčistit nepoužívané projekty
```bash
# Pokud už nepracuješ na těchto projektech:
rm -rf ~/.cache/claude-cli-nodejs/-home-noreason-Music/
rm -rf ~/.cache/claude-cli-nodejs/-home-noreason-browsermcp-enhanced/
```

---

### FÁZE 4: REORGANIZACE INSTALACÍ (ROZHODNUTÍ)

#### Varianta A: Ponechat JEN produkční verzi
```bash
# Přesunout vývojovou verzi do archive
mkdir -p ~/archive/browsermcp
mv ~/browsermcp-enhanced ~/archive/browsermcp/

# Smazat starou zálohu
rm -rf ~/.local/backups/browsermcp-enhanced/
```

#### Varianta B: Ponechat vývojovou + produkční
```bash
# Jen vyčistit starou zálohu
rm -rf ~/.local/backups/browsermcp-enhanced/

# Jasně označit co je co
echo "PRODUKČNÍ VERZE - Používá systemd" > ~/.local/lib/browsermcp-enhanced/README.md
echo "VÝVOJOVÁ VERZE - Pro vývoj" > ~/browsermcp-enhanced/README.md
```

---

### FÁZE 5: KONTROLA A OVĚŘENÍ

#### 5.1 Ověřit běžící procesy
```bash
# Měly by běžet jen systemd služby
sudo systemctl status browsermcp-http.service
sudo systemctl status browsermcp-daemon.service

# Zkontrolovat porty
ss -tlnp | grep -E "5555|8765"
# Port 5555: browsermcp HTTP
# Port 8765: browsermcp daemon
```

#### 5.2 Ověřit Claude Code konfigurace
```bash
# Spustit Claude Code a zkontrolovat /mcp
claude
# Pak v CLI: /mcp
# Měly by být vidět:
# - browsermcp: connected (port 5555)
# - sage: connected
```

#### 5.3 Ověřit velikosti po čištění
```bash
du -sh ~/.claude/
du -sh ~/.cache/claude-cli-nodejs/
du -sh ~/.local/lib/browsermcp-enhanced/
```

---

## 🎯 OČEKÁVANÉ VÝSLEDKY

### Před čištěním:
- ~/.claude: **234M**
- browsermcp instalace: **230M** (2 kopie)
- Běžící procesy: **3** (1 duplicitní)
- Konfigurace: **7 souborů** (duplikáty)
- Cache: **~600K** (7 projektů)

### Po čištění:
- ~/.claude: **~50M** (úspora 184M)
- browsermcp instalace: **86M** nebo **144M** (1 kopie)
- Běžící procesy: **2** (jen systemd)
- Konfigurace: **1-2 soubory** (clean)
- Cache: **~400K** (aktivní projekty)

---

## ⚠️ VAROVÁNÍ

### NEPROVÁDĚT:
- ❌ Nemaž `~/.claude.json` - obsahuje všechny konfigurace projektů!
- ❌ Nemaž `~/.claude/history.jsonl` - historie konverzací
- ❌ Nerestartuj systemd služby během čištění
- ❌ Nemaž `/etc/systemd/system/browsermcp-*.service`

### PŘED ČIŠTĚNÍM:
```bash
# Vytvoř kompletní zálohu
tar -czf ~/claude-backup-before-cleanup-$(date +%Y%m%d).tar.gz \
  ~/.claude.json \
  ~/.claude/settings*.json \
  ~/project/fakturace/.claude/ \
  /etc/default/browsermcp

# Ověř že máš zálohu
ls -lh ~/claude-backup-*.tar.gz
```

---

## 📝 KONTROLNÍ SEZNAM

### Před čištěním:
- [ ] Vytvořit zálohu `~/.claude.json`
- [ ] Vytvořit zálohu `/etc/default/browsermcp`
- [ ] Zastavit všechny Claude Code sessions
- [ ] Zkontrolovat běžící procesy

### Během čištění:
- [ ] Zabít duplicitní browsermcp proces (PID 932229)
- [ ] Najít původ duplicitního procesu
- [ ] Smazat prázdné konfigurace
- [ ] Smazat staré zálohy
- [ ] Vyčistit debug logy
- [ ] Vyčistit staré todo soubory
- [ ] Rozhodnout o duplicitních instalacích

### Po čištění:
- [ ] Ověřit systemd služby běží
- [ ] Ověřit Claude Code se připojuje
- [ ] Ověřit browsermcp funguje
- [ ] Zkontrolovat velikosti adresářů
- [ ] Otestovat fakturační projekt

---

## 🔧 DLOUHODOBÉ DOPORUČENÍ

### Prevence bordelu:
1. **Automatické čištění cache:**
   ```bash
   # Přidat do crontab (týdně)
   0 3 * * 0 find ~/.claude/debug/ -type f -mtime +7 -delete
   0 3 * * 0 find ~/.claude/todos/ -type f -mtime +30 -delete
   ```

2. **Jasné označení verzí:**
   ```bash
   # V každé instalaci vytvořit README
   echo "PRODUKCE - systemd" > ~/.local/lib/browsermcp-enhanced/VERSION.txt
   echo "VÝVOJ" > ~/browsermcp-enhanced/VERSION.txt
   ```

3. **Centralizovat konfigurace:**
   - Používat JEN `~/.claude.json` pro CLI
   - Desktop konfigurace oddělit do jiného adresáře

4. **Zálohy s popisem:**
   ```bash
   # Vždy přidávat popis
   tar -czf ~/backups/claude-$(date +%Y%m%d)-pred-upgrade.tar.gz ~/.claude.json
   ```

---

**Vytvořeno:** 2025-10-20
**Autor:** Claude Code (analýza systému)
**Status:** NÁVRH - čeká na schválení před provedením
