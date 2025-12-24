import { create } from 'xmlbuilder2';
import * as storageService from './storageService';
import { Service, Hardware, Organization } from '@prisma/client';

const toCurrency = (value: any) => {
    if (value === null || value === undefined) {
        return '0.00';
    }
    return Number(value).toFixed(2);
};

const toNumber = (value: any, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const aggregateWork = (workRecords: any[] = [], organization: any = {}) => {
    const totalMinutes = workRecords.reduce((sum, record) => sum + toNumber(record.minutes), 0);
    const totalHours = totalMinutes / 60;
    const totalKm = workRecords.reduce((sum, record) => sum + toNumber(record.kilometers), 0);
    const hourlyRate = (organization.hourlyRateCents || 0) / 100;
    const kmRate = (organization.kilometerRateCents || 0) / 100;

    return {
        totalHours,
        totalKm,
        hourlyRate,
        kmRate,
    };
};

export class IsdocExport {
    currency: string;

    constructor() {
        this.currency = 'CZK';
    }

    private _formatDate(dateLike: any) {
        const date = dateLike ? new Date(dateLike) : new Date();
        if (Number.isNaN(date.getTime())) {
            return new Date().toISOString().split('T')[0];
        }
        return date.toISOString().split('T')[0];
    }

    private _buildSupplier(root: any) {
        const supplier = root.ele('cac:AccountingSupplierParty').ele('cac:Party');
        const partyName = supplier.ele('cac:PartyName');
        partyName.ele('cbc:Name').txt(process.env.COMPANY_NAME || 'Vaše firma s.r.o.');

        const taxScheme = supplier.ele('cac:PartyTaxScheme');
        taxScheme.ele('cbc:CompanyID').txt(process.env.COMPANY_DIC || 'CZ12345678');

        const identification = supplier.ele('cac:PartyIdentification');
        identification.ele('cbc:ID').txt(process.env.COMPANY_ICO || '12345678');

        const address = supplier.ele('cac:PostalAddress');
        address
            .ele('cbc:StreetName')
            .txt((process.env.COMPANY_ADDRESS || 'Ulice 123, Praha').split(',')[0] || 'Ulice 123');
        address.ele('cbc:CityName').txt('Praha');
        address.ele('cbc:PostalZone').txt('10000');
        address.ele('cac:Country').ele('cbc:IdentificationCode').txt('CZ');
    }

    private _buildCustomer(root: any, organization: Organization) {
        const customer = root.ele('cac:AccountingCustomerParty').ele('cac:Party');
        customer.ele('cac:PartyName').ele('cbc:Name').txt(organization.name || 'Zákazník');

        if (organization.dic) {
            customer.ele('cac:PartyTaxScheme').ele('cbc:CompanyID').txt(organization.dic);
        }

        if (organization.ico) {
            customer.ele('cac:PartyIdentification').ele('cbc:ID').txt(organization.ico);
        }

        const address = customer.ele('cac:PostalAddress');
        if (organization.address) {
            const [street = '', city = '', postal = ''] = organization.address
                .split(',')
                .map((part) => part.trim());
            address.ele('cbc:StreetName').txt(street || organization.address);
            if (city) address.ele('cbc:CityName').txt(city);
            if (postal) address.ele('cbc:PostalZone').txt(postal);
        }
        address.ele('cac:Country').ele('cbc:IdentificationCode').txt('CZ');
    }

    private _appendInvoiceLine(
        root: any,
        index: number,
        { text, quantity, unitPrice, vatRate }: any
    ) {
        const lineId = index + 1;
        const qty = quantity || 0;
        const price = unitPrice || 0;
        const total = price * qty;
        const vatPercent = vatRate !== null && vatRate !== undefined ? vatRate : 21;
        const vatAmount = total * (vatPercent / 100);

        const line = root.ele('cac:InvoiceLine');
        line.ele('cbc:ID').txt(String(lineId));
        line.ele('cbc:InvoicedQuantity', { unitCode: 'H87' }).txt(Number(qty).toFixed(2));
        line.ele('cbc:LineExtensionAmount', { currencyID: this.currency }).txt(toCurrency(total));

        const item = line.ele('cac:Item');
        item.ele('cbc:Description').txt(text || `Položka ${lineId}`);

        const priceElement = line.ele('cac:Price');
        priceElement.ele('cbc:PriceAmount', { currencyID: this.currency }).txt(toCurrency(price));

        const taxTotal = line.ele('cac:TaxTotal');
        taxTotal.ele('cbc:TaxAmount', { currencyID: this.currency }).txt(toCurrency(vatAmount));

        const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
        taxSubtotal.ele('cbc:TaxAmount', { currencyID: this.currency }).txt(toCurrency(vatAmount));

        const taxCategory = taxSubtotal.ele('cac:TaxCategory');
        taxCategory.ele('cbc:Percent').txt(Number(vatPercent).toFixed(2));
    }

    private _collectLines({
        services = [],
        workRecords = [],
        hardware = [],
        organization,
    }: {
        services: Service[];
        workRecords: any[];
        hardware: Hardware[];
        organization: any;
    }) {
        const lines: any[] = [];

        services
            .filter((service) => service?.isActive !== false)
            .forEach((service) => {
                const price = (service.monthlyPriceCents || 0) / 100;
                lines.push({
                    text: service.serviceName || 'Služba',
                    quantity: 1,
                    unitPrice: price,
                    vatRate: 21,
                });
            });

        const work = aggregateWork(workRecords, organization);
        if (work.totalHours > 0 && work.hourlyRate > 0) {
            lines.push({
                text: 'Práce IT technika',
                quantity: work.totalHours,
                unitPrice: work.hourlyRate,
                vatRate: 21,
            });
        }
        if (work.totalKm > 0 && work.kmRate > 0) {
            lines.push({
                text: 'Kilometrovné',
                quantity: work.totalKm,
                unitPrice: work.kmRate,
                vatRate: 21,
            });
        }

        hardware.forEach((item, index) => {
            const quantity = toNumber(item.quantity, 1);
            const total = item.totalPriceCents ? item.totalPriceCents / 100 : null;
            const unit = item.unitPriceCents ? item.unitPriceCents / 100 : (total || 0) / quantity || 0;
            lines.push({
                text: item.itemName || `Hardware ${index + 1}`,
                quantity,
                unitPrice: unit,
                vatRate: item.vatRate !== undefined && item.vatRate !== null ? item.vatRate : 21,
            });
        });

        return lines;
    }

    generateInvoiceXML(
        invoice: any,
        organization: Organization,
        workRecords: any[],
        services: Service[],
        hardware: Hardware[],
        totals: any
    ) {
        const currency = invoice.currency || this.currency;
        this.currency = currency;
        const totalAmount = Number(totals?.totalAmount || 0);
        const totalVat = Number(totals?.totalVat || 0);
        const totalWithVat = totalAmount + totalVat;

        const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Invoice', {
            xmlns: 'urn:cz:isdoc:invoice:1',
            'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        });

        root.ele('cbc:ID').txt(invoice.invoiceNumber || `ISDOC-${invoice.id}`);
        root.ele('cbc:IssueDate').txt(this._formatDate(invoice.generatedAt || new Date()));
        root.ele('cbc:DocumentCurrencyCode').txt(currency);

        this._buildSupplier(root);
        this._buildCustomer(root, organization);

        const lineContainer = root.ele('cac:InvoiceLines');
        const lines = this._collectLines({ services, workRecords, hardware, organization });
        lines.forEach((line, index) => this._appendInvoiceLine(lineContainer, index, line));

        const taxTotal = root.ele('cac:TaxTotal');
        taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(toCurrency(totalVat));

        const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
        taxSubtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(toCurrency(totalVat));
        taxSubtotal.ele('cac:TaxCategory').ele('cbc:Percent').txt('21.00');

        const monetary = root.ele('cac:LegalMonetaryTotal');
        monetary.ele('cbc:TaxExclusiveAmount', { currencyID: currency }).txt(toCurrency(totalAmount));
        monetary.ele('cbc:TaxInclusiveAmount', { currencyID: currency }).txt(toCurrency(totalWithVat));

        // @ts-ignore
        return Buffer.from(root.end({ prettyPrint: true }), 'utf8');
    }

    async saveInvoiceISDOC(
        invoice: any,
        workRecords: any[],
        services: Service[],
        hardware: Hardware[],
        organization: Organization,
        totals: any
    ) {
        const xmlBuffer = this.generateInvoiceXML(
            invoice,
            organization,
            workRecords,
            services,
            hardware,
            totals
        );

        const stored = await storageService.saveFile({
            buffer: xmlBuffer,
            prefix: 'exports/isdoc',
            extension: '.isdoc',
            contentType: 'application/xml',
        });

        return {
            filename: `${invoice.invoiceNumber}.isdoc`,
            location: stored.location,
            size: stored.size,
        };
    }
}

export default IsdocExport;
