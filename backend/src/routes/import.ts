import express, { Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';
import { toCents } from '../utils/money';
import storageService from '../services/storageService';
import { logAudit } from '../services/auditLogger';

const router = express.Router();
const prisma = new PrismaClient();

interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        name: string;
    };
}

interface OrganizationMapEntry {
    name: string;
    code: string;
}

// Mapování názvů organizací z Excel na interní kódy
const organizationMapping: Record<string, OrganizationMapEntry> = {
    // Z původních dat
    'LT - Lázně Toušeň': { name: 'Lázně Toušeň', code: 'LT' },
    'O - Oresi': { name: 'Oresi CZ', code: 'O' },
    'OSK - Oresi SK': { name: 'Oresi SK', code: 'OSK' },
    'TVMNET  - TVM NET GROUP': { name: 'TVM NET GROUP', code: 'TVMNET' },
    'TVMNET - TVM NET GROUP': { name: 'TVM NET GROUP', code: 'TVMNET' }, // bez dvojité mezery
    'MŠSKALICE - Skalice - Školka': { name: 'MŠ Skalice', code: 'MSSKALICE' },
    'DOH - Oresi - Dohnal': { name: 'Oresi - Dohnal', code: 'DOH' },
    'AWC - AmbassadorWineClub': { name: 'Ambassador Wine Club', code: 'AWC' },
    'CEN - Centrála': { name: 'Centrála', code: 'CEN' },
    'ERW - EraWine': { name: 'Era Wine', code: 'ERW' },
    'GON - Oresi - Gonda': { name: 'Oresi - Gonda', code: 'GON' },
    'KOP - Oresi - Kopecký': { name: 'Oresi - Kopecký', code: 'KOP' },
    'PBC - Prague Body Clinic': { name: 'Prague Body Clinic', code: 'PBC' },
    'VAJ - Oresi - Vajnlich': { name: 'Oresi - Vajnlich', code: 'VAJ' },

    // Z nových dat - společnosti
    'O01 - Oresi - Vršovice': { name: 'Oresi - Vršovice', code: 'O01' },
    'O03 - Oresi - Kolín': { name: 'Oresi - Kolín', code: 'O03' },
    'O06 - Oresi - Liberec': { name: 'Oresi - Liberec', code: 'O06' },
    'O12 - Oresi - Chomutov': { name: 'Oresi - Chomutov', code: 'O12' },
    'O14 - Oresi - Pankrác': { name: 'Oresi - Pankrác', code: 'O14' },
    'O34 - Oresi - Brno(Lidická)': { name: 'Oresi - Brno (Lidická)', code: 'O34' },
    'O35 - Oresi - Březí': { name: 'Oresi - Březí', code: 'O35' },
    'OBA4 - OresiSK - BA4': { name: 'OresiSK - BA4', code: 'OBA4' },
    'OBER - Oresi - Beroun': { name: 'Oresi - Beroun', code: 'OBER' },
    'OHBR - Oresi - Havl.Brod': { name: 'Oresi - Havlíčkův Brod', code: 'OHBR' },
    'OKLA - Oresi - Klatovy': { name: 'Oresi - Klatovy', code: 'OKLA' },
    'OLIT - Oresi - Litoměřice': { name: 'Oresi - Litoměřice', code: 'OLIT' },
    'OPRI - Oresi - Příbram': { name: 'Oresi - Příbram', code: 'OPRI' },
    'NRCEN - NoReason - centrála': { name: 'NoReason - centrála', code: 'NRCEN' }
};

// Konfigurace multer pro upload souborů
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Max 10MB
    },
    fileFilter: (req: any, file: any, cb: any) => {
        // Povolené typy souborů
        const allowedTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream' // Pro curl uploads
        ];

        console.log('File MIME type:', file.mimetype);
        console.log('File originalname:', file.originalname);

        // Kontrola podle MIME typu nebo přípony souboru
        const fileExtension = file.originalname.toLowerCase().split('.').pop();
        const isExcelFile = fileExtension === 'xlsx' || fileExtension === 'xls';

        if (allowedTypes.includes(file.mimetype) || isExcelFile) {
            cb(null, true);
        } else {
            cb(new Error('Neplatný typ souboru. Pouze Excel soubory jsou povoleny.'));
        }
    }
});

// Import dat z Excel souboru
router.post('/excel', authMiddleware, authorize('workRecords:write'), upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Žádný soubor nebyl nahrán' });
        }

        let storedFile: { location: string; size: number } | null = null;
        try {
            const originalExt = (req.file.originalname || '').split('.').pop();
            storedFile = await storageService.saveFile({
                buffer: req.file.buffer,
                prefix: 'imports/excel',
                extension: originalExt ? `.${originalExt}` : '.xlsx',
                contentType: req.file.mimetype,
            });
        } catch (storageError: any) {
            console.error('Import storage error:', storageError);
            return res.status(500).json({
                message: 'Soubor se nepodařilo uložit do úložiště',
                error: storageError.message,
            });
        }

        // Načtení Excel souboru
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Převod na JSON
        const data: any[] = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            dateNF: 'dd.mm.yyyy'
        });

        if (data.length === 0) {
            return res.status(400).json({ message: 'Excel soubor neobsahuje žádná data' });
        }

        // Zpracování dat
        let importedCount = 0;
        let skippedRows = 0;
        let newOrganizations = 0;
        const affectedOrganizationIds = new Set<number>();
        const newlyCreatedOrganizations: any[] = [];
        const errors: string[] = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];

            try {
                // Přeskočit prázdné řádky nebo součtové řádky
                if (!row.Pracovník || !row.Datum || row.Pracovník === '' || row.Datum === '') {
                    continue;
                }

                // Validace povinných polí - kontrola obou možných názvů sloupců
                const organizace = row['Společnost-pobočka'] || row.Organizace;
                const popis = row.Popis || row.popis;
                const hodiny = row['Počet hodin'] || row.Hodiny;
                const km = row['Výjezd (km)'] || row.Km || 0;

                if (!row.Datum || !organizace || !row.Pracovník || !popis) {
                    skippedRows++;
                    errors.push(`Řádek ${i + 2}: Chybí povinné údaje (Datum: ${row.Datum}, Organizace: ${organizace}, Pracovník: ${row.Pracovník}, Popis: ${popis})`);
                    continue;
                }

                // Převod hodin na minuty
                let minutes = 0;
                if (hodiny) {
                    const hoursStr = hodiny.toString().trim();
                    if (hoursStr.includes(':')) {
                        const parts = hoursStr.split(':');
                        minutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                    } else {
                        minutes = parseFloat(hoursStr) * 60;
                    }
                }

                // Převod data
                let date: Date;
                const datumStr = row.Datum.toString().trim();
                if (datumStr.includes('.')) {
                    const [day, month, year] = datumStr.split('.');
                    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                } else {
                    date = new Date(datumStr);
                }

                // Mapuj název organizace
                const orgMapping = organizationMapping[organizace];
                const orgName = orgMapping ? orgMapping.name : organizace;
                const orgCode = orgMapping ? orgMapping.code : null;

                // Najdi nebo vytvoř organizaci
                const organizationWhere: any[] = [];
                if (orgCode) {
                    organizationWhere.push({ code: orgCode });
                }
                if (orgName) {
                    organizationWhere.push({ name: orgName });
                }

                let organization = await prisma.organization.findFirst({
                    where: {
                        OR: organizationWhere
                    }
                });

                if (!organization) {
                    organization = await prisma.organization.create({
                        data: {
                            name: orgName,
                            code: orgCode,
                            ico: '00000000', // Výchozí hodnota
                            hourlyRateCents: toCents(550),
                            kilometerRateCents: toCents(10),
                            // @ts-ignore
                            createdBy: req.user.id
                        }
                    });
                    newOrganizations++;
                    newlyCreatedOrganizations.push({
                        id: organization.id,
                        name: organization.name,
                        code: organization.code
                    });
                }

                affectedOrganizationIds.add(organization.id);

                // Získej zakázku (projektový kód)
                const projectCode = row.Zakázka || row['Zakázka'] || null;

                // Najdi organizaci pro fakturaci podle zakázky
                let billingOrgId: number | null = null;
                if (projectCode && organizationMapping[projectCode]) {
                    const billingOrgMapping = organizationMapping[projectCode];
                    const billingOrgWhere: any[] = [];
                    if (billingOrgMapping.code) {
                        billingOrgWhere.push({ code: billingOrgMapping.code });
                    }
                    if (billingOrgMapping.name) {
                        billingOrgWhere.push({ name: billingOrgMapping.name });
                    }

                    const billingOrg = await prisma.organization.findFirst({
                        where: {
                            OR: billingOrgWhere
                        }
                    });

                    if (billingOrg) {
                        billingOrgId = billingOrg.id;
                        affectedOrganizationIds.add(billingOrg.id);
                    } else {
                        // Vytvoř novou organizaci pro fakturaci
                        const newBillingOrg = await prisma.organization.create({
                            data: {
                                name: billingOrgMapping.name,
                                code: billingOrgMapping.code,
                                ico: '00000000',
                                hourlyRateCents: toCents(550),
                                kilometerRateCents: toCents(10),
                                // @ts-ignore
                                createdBy: req.user.id
                            }
                        });
                        billingOrgId = newBillingOrg.id;
                        newOrganizations++;
                        affectedOrganizationIds.add(newBillingOrg.id);
                        newlyCreatedOrganizations.push({
                            id: newBillingOrg.id,
                            name: newBillingOrg.name,
                            code: newBillingOrg.code
                        });
                    }
                }

                // Získej měsíc a rok z data
                const month = date.getMonth() + 1; // JavaScript měsíce jsou 0-11
                const year = date.getFullYear();

                // Vytvoř záznam práce
                await prisma.workRecord.create({
                    data: {
                        date: date,
                        description: popis,
                        minutes: minutes,
                        kilometers: parseInt(km) || 0,
                        worker: row.Pracovník,
                        organizationId: organization.id,
                        projectCode: projectCode,
                        billingOrgId: billingOrgId || organization.id, // Pokud není specifikováno jinak, fakturuj na stejnou organizaci
                        month: month,
                        year: year,
                        // @ts-ignore
                        createdBy: req.user.id
                    }
                });

                importedCount++;
            } catch (error: any) {
                skippedRows++;
                errors.push(`Řádek ${i + 2}: ${error.message}`);
            }
        }

        const responsePayload = {
            success: true,
            imported: importedCount,
            organizations: affectedOrganizationIds.size,
            details: {
                totalRows: data.length,
                skippedRows,
                newOrganizations
            },
            newlyCreatedOrganizations,
            errors: errors,
            fileLocation: storedFile?.location ?? null,
        };

        await logAudit(prisma, {
            actorId: req.user?.id || 0,
            entity: 'ImportExcel',
            entityId: req.user?.id || 0,
            action: 'IMPORT',
            diff: {
                fileLocation: storedFile?.location ?? null,
                imported: importedCount,
                organizations: affectedOrganizationIds.size,
                skippedRows,
                newOrganizations,
                errors,
            },
        });

        res.json(responsePayload);

    } catch (error: any) {
        console.error('Import error:', error);
        res.status(500).json({
            message: 'Chyba při zpracování souboru',
            error: error.message
        });
    }
});

// Získání vzorového Excel souboru
router.get('/template', authMiddleware, authorize('workRecords:write'), (req: AuthRequest, res: Response) => {
    // Vytvoření vzorového souboru
    const ws_data = [
        ['Datum', 'Organizace', 'Pracovník', 'Popis', 'Hodiny', 'Km'],
        ['15.7.2025', 'Lázně Toušeň', 'Jan Novák', 'Instalace softwaru', '2:30', '25'],
        ['16.7.2025', 'Oresi CZ', 'Petr Dvořák', 'Údržba serveru', '4:00', '0'],
        ['17.7.2025', 'TVM NET GROUP', 'Jan Novák', 'Konzultace IT', '1:30', '50']
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vzor');

    // Odeslání souboru
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="vzor_import.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

export default router;
