# Vizuální dokumentace - Fakturační systém

## 📋 Obsah
1. [Přehled designu](#přehled-designu)
2. [Barevné schéma](#barevné-schéma)
3. [Typografie](#typografie)
4. [Komponenty](#komponenty)
5. [Layout struktura](#layout-struktura)
6. [Dashboard](#dashboard)
7. [Faktury](#faktury)
8. [Responzivní design](#responzivní-design)
9. [Stavové indikátory](#stavové-indikátory)
10. [Tiskový výstup](#tiskový-výstup)

---

## 🎨 Přehled designu

Systém používá **čistý, profesionální design** založený na Material Design principech s důrazem na přehlednost a funkčnost. Design je optimalizován pro práci s tabulkovými daty a snadnou orientaci.

### Hlavní charakteristiky
- **Flat design** - bez gradientů a složitých efektů
- **Vysoký kontrast** - snadná čitelnost
- **Barevné kódování** - rychlá orientace ve stavech
- **Strukturované sekce** - jasné oddělení oblastí

---

## 🎨 Barevné schéma

### Primární barvy

```css
/* Hlavní barvy */
--primary-green: #4CAF50;    /* Hlavní zelená - header, primární akce */
--primary-blue: #2196F3;     /* Sekundární modrá - hlavičky tabulek */
--white: #FFFFFF;            /* Bílé pozadí karet */
--gray-bg: #F5F5F5;          /* Šedé pozadí stránky */
```

### Sekce faktur

```css
/* Barvy sekcí ve fakturách */
--section-header: #E8F5E9;   /* Světle zelená - hlavičky sekcí */
--summary-section: #FFF3E0;  /* Světle oranžová - shrnutí */
--total-row: #FFECB3;        /* Tmavší oranžová - celkové součty */
--info-box: #FFF3E0;         /* Žlutá - poznámky a upozornění */
```

### Stavové barvy

```css
/* Indikátory stavů */
--status-success: #4CAF50;   /* Zelená - dokončeno/vygenerováno */
--status-warning: #FF9800;   /* Oranžová - rozpracováno/čeká */
--status-error: #F44336;     /* Červená - chybí/problém */
--status-info: #2196F3;      /* Modrá - informace */
```

### Neutrální barvy

```css
/* Odstíny šedé */
--text-primary: #333333;     /* Hlavní text */
--text-secondary: #666666;   /* Sekundární text */
--text-muted: #999999;       /* Tlumený text */
--border-color: #DDDDDD;     /* Bordery tabulek */
--hover-color: #F0F8FF;      /* Hover efekt na řádcích */
--zebra-stripe: #F9F9F9;     /* Sudé řádky tabulek */
```

---

## 📝 Typografie

### Font Stack

```css
font-family: Arial, sans-serif;  /* Hlavní font */
```

### Velikosti písma

| Element | Velikost | Váha | Použití |
|---------|----------|------|---------|
| H1 | 32px | Bold | Hlavní nadpisy stránek |
| H2 | 24px | Bold | Sekce |
| H3 | 18px | Bold | Podsekce |
| Hlavička tabulky | 18px | Bold | Modré hlavičky |
| Sekce faktury | 16px | Bold | Zelené sekce |
| Běžný text | 14px | Normal | Obsah tabulek |
| Malý text | 12px | Normal | Poznámky, badges |

### Text Transform

```css
/* Hlavičky tabulek */
th {
    text-transform: none;  /* Normální velikost písmen */
}

/* Statistiky */
.stat-card h3 {
    text-transform: uppercase;  /* VELKÁ PÍSMENA */
    letter-spacing: 0.5px;
}
```

---

## 🧩 Komponenty

### 1. Header (Hlavička)

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Fakturační Systém        Dashboard | Faktury | ...   │ (Zelená #4CAF50)
└─────────────────────────────────────────────────────────┘
```

**Vlastnosti:**
- Výška: 50px
- Pozadí: #4CAF50
- Text: Bílý
- Box-shadow: 0 2px 4px rgba(0,0,0,0.1)

### 2. Statistické karty

```
┌──────────────────┐
│ AKTIVNÍ ORGANIZACE│ (šedý text)
│       13         │ (velké číslo)
│ celkem v systému │ (popis)
└──────────────────┘
```

**Vlastnosti:**
- Pozadí: Bílé
- Border-left: 4px solid (barevný)
- Padding: 20px
- Border-radius: 8px
- Box-shadow: 0 2px 4px rgba(0,0,0,0.1)

### 3. Tabulky

```
┌─────────────────────────────────────┐
│ Přehled organizací                 │ (Modrá hlavička #2196F3)
├──────┬──────┬──────┬──────┬────────┤
│  TH  │  TH  │  TH  │  TH  │   TH   │ (Šedá #F0F0F0)
├──────┼──────┼──────┼──────┼────────┤
│  TD  │  TD  │  TD  │  TD  │   TD   │ (Bílá)
├──────┼──────┼──────┼──────┼────────┤
│  TD  │  TD  │  TD  │  TD  │   TD   │ (Šedá #F9F9F9)
└──────┴──────┴──────┴──────┴────────┘
```

**Vlastnosti:**
- Border: 1px solid #DDD
- Padding: 8-10px
- Hover: #F0F8FF
- Sticky header

### 4. Tlačítka

```css
.btn {
    padding: 10px 20px;
    border-radius: 4px;
    font-weight: bold;
    transition: opacity 0.3s;
}

.btn-primary { background: #4CAF50; }  /* Zelená */
.btn-secondary { background: #2196F3; } /* Modrá */
.btn-warning { background: #FF9800; }   /* Oranžová */
```

### 5. Stavové badges

```
[Vygenerováno]  - Zelené pozadí, bílý text
[Rozpracováno]  - Oranžové pozadí, bílý text
[Chybí data]    - Červené pozadí, bílý text
```

---

## 📐 Layout struktura

### Grid System

```css
/* Dashboard grid */
.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

/* Container */
.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}
```

### Spacing

| Element | Margin | Padding |
|---------|--------|---------|
| Container | 20px auto | 20px |
| Cards | 0 0 30px 0 | 20px |
| Table cells | - | 8px |
| Buttons | 0 10px 0 0 | 10px 20px |
| Sections | 30px 0 | - |

---

## 📊 Dashboard

### Struktura

```
┌─────────────────────────────────────────────────────┐
│                    HEADER                           │
├─────────────────────────────────────────────────────┤
│  H1: Dashboard - Červenec 2025                     │
├─────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ STAT │ │ STAT │ │ STAT │ │ STAT │  (4 karty)  │
│  └──────┘ └──────┘ └──────┘ └──────┘             │
├─────────────────────────────────────────────────────┤
│  RYCHLÉ AKCE                                       │
│  [Import] [Generovat] [Export] [Report]            │
├─────────────────────────────────────────────────────┤
│  TABULKA ORGANIZACÍ                                │
│  ┌─────────────────────────────────┐              │
│  │ Organizace | Hodiny | Stav | ... │              │
│  └─────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

### Komponenty dashboardu

1. **Statistické karty** - 4 karty v gridu
2. **Rychlé akce** - 4 hlavní tlačítka
3. **Tabulka organizací** - přehled všech organizací

---

## 📄 Faktury

### Struktura faktury

```
┌─────────────────────────────────────────────────────┐
│            LT - Lázně Toušeň (L. Valehrach)        │ (Modrá #2196F3)
├─────────────────────────────────────────────────────┤
│  CENOVÉ PODMÍNKY                                    │ (Zelená #E8F5E9)
│  • Hodinová sazba: 550 Kč/hod                      │
│  • Sazba za km: 10 Kč/km                           │
├─────────────────────────────────────────────────────┤
│  PAUŠÁLNÍ SLUŽBY                                    │ (Zelená #E8F5E9)
│  ┌────────────────────────────────┐                │
│  │ Služba | Popis | Cena         │                │
│  └────────────────────────────────┘                │
├─────────────────────────────────────────────────────┤
│  PRÁCE IT TECHNIKA NAD RÁMEC                       │ (Zelená #E8F5E9)
│  ┌──────────────────────────────────────────┐     │
│  │ Datum | Pracovník | Popis | Hod | Km | Kč│     │
│  ├──────────────────────────────────────────┤     │
│  │ Data rows...                              │     │
│  ├──────────────────────────────────────────┤     │
│  │ CELKEM                     | 1:00| 0 |550│     │ (Oranžová #FFF3E0)
│  └──────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────┤
│  FAKTUROVANÝ HARDWARE                              │ (Zelená #E8F5E9)
│  (Seznam hardware nebo "Žádný hardware")           │
├─────────────────────────────────────────────────────┤
│  SOUHRN ZA MĚSÍC                                   │ (Zelená #E8F5E9)
│  Paušální služby:              3 000 Kč            │
│  Práce nad rámec:                550 Kč            │
│  Cestovné:                         0 Kč            │
│  Hardware:                         0 Kč            │
│  ─────────────────────────────────────             │
│  CELKEM K FAKTURACI:          3 550 Kč            │ (Žlutá #FFECB3)
├─────────────────────────────────────────────────────┤
│  ⚠️ Poznámka: Uvedené ceny jsou bez DPH            │ (Info box #FFF3E0)
└─────────────────────────────────────────────────────┘
```

### Sekce faktury

| Sekce | Pozadí | Border | Font |
|-------|--------|--------|------|
| Hlavička (název) | #2196F3 | - | 18px bold, bílá |
| Sekce (nadpisy) | #E8F5E9 | 1px #DDD | 16px bold |
| Shrnutí | #FFF3E0 | 1px #DDD | 14px bold |
| Celkem | #FFECB3 | 1px #DDD | 16px bold |
| Info box | #FFF3E0 | 1px #FFCC80 | 14px |

---

## 📱 Responzivní design

### Breakpointy

```css
/* Mobile */
@media (max-width: 768px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
    table {
        font-size: 12px;
    }
}

/* Tablet */
@media (min-width: 769px) and (max-width: 1024px) {
    .dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

/* Desktop */
@media (min-width: 1025px) {
    .container {
        max-width: 1400px;
    }
}
```

---

## 🚦 Stavové indikátory

### Barvy stavů

| Stav | Barva | HEX | Použití |
|------|-------|-----|---------|
| ✅ Vygenerováno | Zelená | #4CAF50 | Dokončené faktury |
| ⏳ Rozpracováno | Oranžová | #FF9800 | Částečně hotové |
| ❌ Chybí data | Červená | #F44336 | Chybějící informace |
| ℹ️ Informace | Modrá | #2196F3 | Obecné info |

### Implementace

```html
<span class="status-badge status-done">Vygenerováno</span>
<span class="status-badge status-pending">Rozpracováno</span>
<span class="status-badge status-missing">Chybí data</span>
```

---

## 🖨️ Tiskový výstup

### CSS pro tisk

```css
@media print {
    /* Skrýt navigaci a tlačítka */
    .no-print { display: none !important; }
    
    /* Bílé pozadí */
    body { background: white; }
    
    /* Plná šířka */
    .container { max-width: 100%; }
    
    /* Zachovat barvy v tabulkách */
    .section-header { 
        background-color: #E8F5E9 !important; 
        -webkit-print-color-adjust: exact;
    }
}
```

### Struktura tiskové faktury
- **Formát:** A4 portrait
- **Okraje:** 20mm
- **Font:** Arial 12pt
- **Barvy:** Zachovány pro lepší čitelnost

---

## 🎯 Best Practices

### Konzistence
- Všechny tabulky používají stejnou strukturu
- Jednotné padding a margin hodnoty
- Konzistentní barevné kódování

### Přístupnost
- Dostatečný kontrast (min 4.5:1)
- Čitelné fonty (min 14px)
- Jasné vizuální hierarchie

### Performance
- Minimální použití stínů
- Jednoduché CSS bez gradientů
- Optimalizované pro rychlé renderování

---

## 📊 Vizuální hierarchie

```
1. HEADER (zelený, nejvýraznější)
   ↓
2. H1 Nadpisy stránek (32px bold)
   ↓
3. Hlavičky tabulek (modrá, 18px)
   ↓
4. Sekce faktury (zelené pozadí)
   ↓
5. Běžný obsah (14px)
   ↓
6. Poznámky (12px, šedá)
```

---

## 🔄 Animace a přechody

```css
/* Hover efekty */
tr:hover { 
    background-color: #F0F8FF; 
    transition: background-color 0.2s;
}

/* Tlačítka */
.btn:hover { 
    opacity: 0.8; 
    transition: opacity 0.3s;
}

/* Žádné složité animace pro lepší výkon */
```

---

## 📝 Závěr

Vizuální design systému je navržen s důrazem na:
- **Přehlednost** - jasná struktura a hierarchie
- **Funkčnost** - rychlá orientace v datech
- **Profesionalitu** - čistý business vzhled
- **Konzistenci** - jednotný design napříč systémem

Všechny vizuální prvky jsou optimalizovány pro práci s velkým množstvím tabulkových dat a snadnou správu fakturace.