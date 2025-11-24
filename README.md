# Fakturační Systém

Komplexní interní systém pro správu IT služeb, fakturace a evidence majetku.

## 🎯 Hlavní Funkce

### 💰 Fakturace a Finance
*   **Vydané faktury:** Rychlé vystavování faktur, automatické generování PDF s QR kódem.
*   **Exporty:** Podpora pro účetní systémy (Pohoda XML) a Excel přehledy.
*   **Statistiky:** Dashboard s přehledem příjmů, neuhrazených faktur a měsíčních obratů.

### 📥 Přijaté Faktury (AI OCR)
*   **Inteligentní vytěžování:** Nahrání faktury (PDF/Scan) a automatické přečtení dat (IČO, částka, datum, položky) pomocí lokální AI.
*   **Schvalování:** Workflow pro kontrolu a schválení nákladů.

### ⏱️ Výkazy Práce (Time Tracking)
*   **Evidence:** Technici vykazují čas, cestovné a použitý materiál u klientů.
*   **Fakturace:** Jedním kliknutím lze převést schválené výkazy na fakturu pro klienta.
*   **Přehledy:** Kontrola efektivity a vytížení techniků.

### 🖥️ Hardware a Sklad
*   **Evidence majetku:** Sledování životního cyklu hardware (nákup -> sklad -> u klienta -> vyřazení).
*   **Přiřazování:** Historie, kdo měl jaké zařízení kdy přidělené.

### 👥 Správa Klientů
*   **CRM:** Adresář organizací s kontakty a historií.
*   **Sazby:** Nastavení individuálních hodinových sazeb a smluvních podmínek.

---

## 🏗️ Architektura
- **Backend:** Node.js (Express), Prisma ORM, PostgreSQL, Redis (BullMQ).
- **Frontend:** Next.js, Mantine UI.
- **Storage:** Minio (S3 compatible) pro soubory.

## 🚀 CI/CD a Deployment
Projekt využívá plně automatizované nasazení pomocí **GitHub Actions**.
*   **Produkce:** Push do  -> Auto Deploy na server.
*   **Verzování:** Sémantické verzování (
> fakturace-system@1.0.0 release
> standard-version

✔ bumping version in package.json from 1.0.0 to 1.0.1
✔ bumping version in package-lock.json from undefined to 1.0.1
✔ outputting changes to CHANGELOG.md
✔ committing package-lock.json and package.json and CHANGELOG.md
✔ tagging release v1.0.1
ℹ Run `git push --follow-tags origin main && npm publish` to publish) generuje CHANGELOG a tagy.

## 🛡️ Zálohování
Databáze se zálohuje automaticky každý den ve 02:00 (uchování 7 dní).

