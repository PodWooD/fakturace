import axios from 'axios';

interface AresResponse {
    ico: string;
    dic?: string;
    obchodniJmeno: string;
    sidlo: {
        nazevUlice?: string;
        cisloDomovni?: number;
        cisloOrientacni?: number;
        nazevObce?: string;
        psc?: number;
    };
}

export interface CompanyData {
    ico: string;
    dic: string | null;
    name: string;
    address: string;
    email: null;
    phone: null;
}

export interface AresResult {
    success: boolean;
    data?: CompanyData;
    error?: string;
}

/**
 * Formátuje adresu ze struktury ARES do čitelného řetězce
 * @param {Object} sidlo - Objekt sidlo z ARES
 * @returns {string} - Naformátovaná adresa
 */
function formatAddress(sidlo: AresResponse['sidlo']): string {
    if (!sidlo) return '';

    const parts: string[] = [];

    // Ulice a číslo popisné/orientační
    if (sidlo.nazevUlice) {
        let streetPart = sidlo.nazevUlice;
        if (sidlo.cisloDomovni) {
            streetPart += ` ${sidlo.cisloDomovni}`;
            if (sidlo.cisloOrientacni) {
                streetPart += `/${sidlo.cisloOrientacni}`;
            }
        }
        parts.push(streetPart);
    } else if (sidlo.cisloDomovni) {
        // Pouze číslo popisné bez ulice
        parts.push(`č.p. ${sidlo.cisloDomovni}`);
    }

    // Obec a PSČ
    let cityPart = '';
    if (sidlo.nazevObce) {
        cityPart = sidlo.nazevObce;
    }
    if (sidlo.psc) {
        const pscFormatted = sidlo.psc.toString().replace(/(\d{3})(\d{2})/, '$1 $2');
        cityPart = pscFormatted + (cityPart ? ' ' + cityPart : '');
    }
    if (cityPart) {
        parts.push(cityPart);
    }

    return parts.join(', ');
}

/**
 * Načte údaje o firmě z ARES API podle IČO
 * @param {string} ico - IČO firmy (může obsahovat mezery)
 * @returns {Promise<AresResult>} - Údaje o firmě
 */
export async function getCompanyByICO(ico: string): Promise<AresResult> {
    try {
        // Odstranění mezer z IČO
        const cleanIco = ico.replace(/\s/g, '');

        // ARES API endpoint
        const url = `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${cleanIco}`;

        const response = await axios.get<AresResponse>(url, {
            headers: {
                'Accept': 'application/json',
            },
            timeout: 10000, // 10 sekund timeout
        });

        const data = response.data;

        if (!data || !data.ico) {
            return {
                success: false,
                error: 'Subjekt s tímto IČO nebyl nalezen v ARES',
            };
        }

        // Extrakce dat z odpovědi ARES
        const result: AresResult = {
            success: true,
            data: {
                ico: data.ico,
                dic: data.dic || null,
                name: data.obchodniJmeno || '',
                address: formatAddress(data.sidlo),
                email: null, // ARES neobsahuje email
                phone: null, // ARES neobsahuje telefon
            },
        };

        return result;
    } catch (error: any) {
        console.error('Chyba při načítání z ARES:', error.message);

        if (error.response?.status === 404) {
            return {
                success: false,
                error: 'Subjekt s tímto IČO nebyl nalezen v ARES',
            };
        }

        return {
            success: false,
            error: 'Chyba při komunikaci s ARES: ' + error.message,
        };
    }
}

/**
 * Validuje IČO (musí být 8 číslic)
 * @param {string} ico 
 * @returns {boolean}
 */
export function validateICO(ico: string): boolean {
    const cleanIco = ico.replace(/\s/g, '');
    return /^\d{8}$/.test(cleanIco);
}
