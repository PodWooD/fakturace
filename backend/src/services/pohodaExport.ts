import { create } from 'xmlbuilder2';
import iconv from 'iconv-lite';
import storageService from './storageService';

export interface MappedInvoice {
    id: number;
    invoiceNumber: string;
    month: number;
    year: number;
    totalAmount: number | null;
    totalVat: number | null;
    notes?: string | null;
}

export interface MappedOrganization {
    name: string;
    address?: string | null;
    ico?: string | null;
    dic?: string | null;
    hourlyRate: number | null;
    kilometerRate: number | null;
}

export interface MappedService {
    isActive: boolean;
    serviceName: string;
    monthlyPrice: number | null;
}

export interface WorkRecord {
    minutes: number;
    kilometers: number;
}

export interface MappedHardware {
    itemName: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number | null;
}

interface BatchItem {
    invoice: MappedInvoice;
    organization: MappedOrganization;
    workRecords: WorkRecord[];
    services: MappedService[];
    hardware: MappedHardware[];
}

const formatPrice = (val: number | null | undefined): string => {
    return (val || 0).toFixed(2);
};

class PohodaExport {
    version: string;
    encoding: string;

    constructor() {
        this.version = '2.0';
        this.encoding = 'Windows-1250';
    }

    generateInvoiceXML(
        invoice: MappedInvoice,
        workRecords: WorkRecord[],
        services: MappedService[],
        hardware: MappedHardware[],
        organization: MappedOrganization
    ): Buffer {
        try {
            // Vytvoření root elementu
            const root = create({ version: '1.0', encoding: this.encoding })
                .ele('dat:dataPack', {
                    'version': this.version,
                    'id': `fa${invoice.id}`,
                    'ico': process.env.COMPANY_ICO || '12345678',
                    'application': 'FakturaceSystem',
                    'note': 'Export faktur',
                    'xmlns:dat': 'http://www.stormware.cz/schema/version_2/data.xsd',
                    'xmlns:inv': 'http://www.stormware.cz/schema/version_2/invoice.xsd',
                    'xmlns:typ': 'http://www.stormware.cz/schema/version_2/type.xsd'
                });

            // Přidání faktury
            const dataPackItem = root.ele('dat:dataPackItem', {
                'id': invoice.invoiceNumber,
                'version': this.version
            });

            const invoiceElement = dataPackItem.ele('inv:invoice', {
                'version': this.version
            });

            // Hlavička faktury
            this._addInvoiceHeader(invoiceElement, invoice, organization);

            // Položky faktury
            this._addInvoiceItems(invoiceElement, workRecords, services, hardware, organization);

            // Souhrn faktury
            this._addInvoiceSummary(invoiceElement, invoice);

            // Převod do Windows-1250
            const xmlString = root.end({ prettyPrint: true });
            const xmlBuffer = iconv.encode(xmlString, this.encoding);

            return xmlBuffer;
        } catch (error: any) {
            throw new Error(`Chyba při generování Pohoda XML: ${error.message}`);
        }
    }

    generateBatchXML(batchItems: BatchItem[]): Buffer {
        if (!Array.isArray(batchItems) || batchItems.length === 0) {
            throw new Error('Žádné faktury pro export');
        }

        try {
            const root = create({ version: '1.0', encoding: this.encoding })
                .ele('dat:dataPack', {
                    version: this.version,
                    id: `batch-${Date.now()}`,
                    ico: process.env.COMPANY_ICO || '12345678',
                    application: 'FakturaceSystem',
                    note: 'Hromadný export faktur',
                    'xmlns:dat': 'http://www.stormware.cz/schema/version_2/data.xsd',
                    'xmlns:inv': 'http://www.stormware.cz/schema/version_2/invoice.xsd',
                    'xmlns:typ': 'http://www.stormware.cz/schema/version_2/type.xsd'
                });

            batchItems.forEach(({ invoice, organization, workRecords, services, hardware }) => {
                const dataPackItem = root.ele('dat:dataPackItem', {
                    id: invoice.invoiceNumber,
                    version: this.version
                });

                const invoiceElement = dataPackItem.ele('inv:invoice', {
                    version: this.version
                });

                this._addInvoiceHeader(invoiceElement, invoice, organization);
                this._addInvoiceItems(invoiceElement, workRecords, services, hardware, organization);
                this._addInvoiceSummary(invoiceElement, invoice);
            });

            const xmlString = root.end({ prettyPrint: true });
            return iconv.encode(xmlString, this.encoding);
        } catch (error: any) {
            throw new Error(`Chyba při generování hromadného Pohoda XML: ${error.message}`);
        }
    }

    private _addInvoiceHeader(invoiceElement: any, invoice: MappedInvoice, organization: MappedOrganization): void {
        const header = invoiceElement.ele('inv:invoiceHeader');

        // Typ faktury
        header.ele('inv:invoiceType').txt('issuedInvoice');

        // Číslo faktury
        const number = header.ele('inv:number');
        number.ele('typ:numberRequested').txt(invoice.invoiceNumber);

        // Variabilní symbol
        header.ele('inv:symVar').txt(invoice.invoiceNumber);

        // Datumy
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 14);

        header.ele('inv:date').txt(this._formatDate(today));
        header.ele('inv:dateTax').txt(this._formatDate(today));
        header.ele('inv:dateDue').txt(this._formatDate(dueDate));

        // Účetní období
        header.ele('inv:accounting')
            .ele('typ:ids').txt('3Fv');

        // Text faktury
        header.ele('inv:text').txt(`Faktura za IT služby ${invoice.month}/${invoice.year}`);

        // Partner (odběratel)
        const partnerIdentity = header.ele('inv:partnerIdentity');
        const address = partnerIdentity.ele('typ:address');

        address.ele('typ:company').txt(organization.name);
        if (organization.address) {
            // Pokus o rozdělení adresy
            const addressLines = organization.address.split(',').map(line => line.trim());
            if (addressLines[0]) address.ele('typ:street').txt(addressLines[0]);
            if (addressLines[1]) address.ele('typ:city').txt(addressLines[1]);
            if (addressLines[2]) address.ele('typ:zip').txt(addressLines[2]);
        }
        if (organization.ico) address.ele('typ:ico').txt(organization.ico || '');
        if (organization.dic) address.ele('typ:dic').txt(organization.dic || '');

        // Moje firma (dodavatel)
        const myIdentity = header.ele('inv:myIdentity');
        const myAddress = myIdentity.ele('typ:address');

        myAddress.ele('typ:company').txt(process.env.COMPANY_NAME || 'Vaše firma s.r.o.');
        myAddress.ele('typ:ico').txt(process.env.COMPANY_ICO || '12345678');
        myAddress.ele('typ:dic').txt(process.env.COMPANY_DIC || 'CZ12345678');

        // Způsob platby
        const paymentType = header.ele('inv:paymentType');
        paymentType.ele('typ:paymentType').txt('draft');
        paymentType.ele('typ:ids').txt('Příkaz');

        // Bankovní účet
        header.ele('inv:account')
            .ele('typ:ids').txt('BANKA');

        // Poznámka
        if (invoice.notes) {
            header.ele('inv:note').txt(invoice.notes);
        }

        // Odpovědná osoba
        header.ele('inv:responsiblePerson')
            .ele('typ:ids').txt('ADMIN');
    }

    private _addInvoiceItems(
        invoiceElement: any,
        workRecords: WorkRecord[],
        services: MappedService[],
        hardware: MappedHardware[],
        organization: MappedOrganization
    ): void {
        const detail = invoiceElement.ele('inv:invoiceDetail');

        // Paušální služby
        if (services && services.length > 0) {
            services.forEach(service => {
                if (service.isActive) {
                    const item = detail.ele('inv:invoiceItem');
                    item.ele('inv:text').txt(service.serviceName);
                    item.ele('inv:quantity').txt('1');
                    item.ele('inv:unit').txt('měs');
                    item.ele('inv:coefficient').txt('1.0');
                    item.ele('inv:payVAT').txt('true');
                    item.ele('inv:rateVAT').txt('high');
                    item.ele('inv:percentVAT').txt('21.0');

                    const homeCurrency = item.ele('inv:homeCurrency');
                    homeCurrency.ele('typ:unitPrice').txt(formatPrice(service.monthlyPrice));
                    homeCurrency.ele('typ:price').txt(formatPrice(service.monthlyPrice));
                    homeCurrency.ele('typ:priceVAT').txt(((service.monthlyPrice || 0) * 0.21).toFixed(2));
                }
            });
        }

        // Práce IT technika
        if (workRecords && workRecords.length > 0) {
            const totalMinutes = workRecords.reduce((sum, record) => sum + record.minutes, 0);
            const totalHours = totalMinutes / 60;
            const totalKm = workRecords.reduce((sum, record) => sum + record.kilometers, 0);

            if (totalHours > 0) {
                const item = detail.ele('inv:invoiceItem');
                item.ele('inv:text').txt('Práce IT technika');
                item.ele('inv:quantity').txt(totalHours.toFixed(2));
                item.ele('inv:unit').txt('hod');
                item.ele('inv:coefficient').txt('1.0');
                item.ele('inv:payVAT').txt('true');
                item.ele('inv:rateVAT').txt('high');
                item.ele('inv:percentVAT').txt('21.0');

                const homeCurrency = item.ele('inv:homeCurrency');
                const hourlyRate = organization.hourlyRate || 0;
                const totalPrice = totalHours * hourlyRate;

                homeCurrency.ele('typ:unitPrice').txt(hourlyRate.toFixed(2));
                homeCurrency.ele('typ:price').txt(totalPrice.toFixed(2));
                homeCurrency.ele('typ:priceVAT').txt((totalPrice * 0.21).toFixed(2));
            }

            // Cestovné
            if (totalKm > 0) {
                const item = detail.ele('inv:invoiceItem');
                item.ele('inv:text').txt('Cestovné');
                item.ele('inv:quantity').txt(totalKm.toString());
                item.ele('inv:unit').txt('km');
                item.ele('inv:coefficient').txt('1.0');
                item.ele('inv:payVAT').txt('true');
                item.ele('inv:rateVAT').txt('high');
                item.ele('inv:percentVAT').txt('21.0');

                const homeCurrency = item.ele('inv:homeCurrency');
                const kmRate = organization.kilometerRate || 0;
                const totalPrice = totalKm * kmRate;

                homeCurrency.ele('typ:unitPrice').txt(kmRate.toFixed(2));
                homeCurrency.ele('typ:price').txt(totalPrice.toFixed(2));
                homeCurrency.ele('typ:priceVAT').txt((totalPrice * 0.21).toFixed(2));
            }
        }

        // Hardware
        if (hardware && hardware.length > 0) {
            hardware.forEach(hw => {
                const item = detail.ele('inv:invoiceItem');
                item.ele('inv:text').txt(hw.itemName);
                item.ele('inv:quantity').txt(hw.quantity.toString());
                item.ele('inv:unit').txt('ks');
                item.ele('inv:coefficient').txt('1.0');
                item.ele('inv:payVAT').txt('true');
                item.ele('inv:rateVAT').txt('high');
                item.ele('inv:percentVAT').txt('21.0');

                const homeCurrency = item.ele('inv:homeCurrency');
                homeCurrency.ele('typ:unitPrice').txt(formatPrice(hw.unitPrice));
                homeCurrency.ele('typ:price').txt(formatPrice(hw.totalPrice));
                homeCurrency.ele('typ:priceVAT').txt(((hw.totalPrice || 0) * 0.21).toFixed(2));
            });
        }
    }

    private _addInvoiceSummary(invoiceElement: any, invoice: MappedInvoice): void {
        const summary = invoiceElement.ele('inv:invoiceSummary');

        // Zaokrouhlení
        summary.ele('inv:roundingDocument').txt('math2one');
        summary.ele('inv:roundingVAT').txt('none');

        // Ceny v domácí měně
        const homeCurrency = summary.ele('inv:homeCurrency');

        // Ceny podle sazeb DPH
        const priceHigh = homeCurrency.ele('typ:priceHigh').txt(formatPrice(invoice.totalAmount));

        // Celkové ceny
        homeCurrency.ele('typ:price', { 'type': 'round' })
            .ele('typ:priceSum').txt(formatPrice(invoice.totalAmount));

        homeCurrency.ele('typ:priceSumVAT', { 'type': 'round' })
            .ele('typ:priceSum').txt(((invoice.totalAmount || 0) + (invoice.totalVat || 0)).toFixed(2));
    }

    private _formatDate(date: Date | string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async savePohodaXML(
        invoice: MappedInvoice,
        workRecords: WorkRecord[],
        services: MappedService[],
        hardware: MappedHardware[],
        organization: MappedOrganization
    ): Promise<{ filename: string; location: string; size: number }> {
        try {
            const xmlBuffer = this.generateInvoiceXML(invoice, workRecords, services, hardware, organization);

            const stored = await storageService.saveFile({
                buffer: xmlBuffer,
                prefix: 'exports/pohoda',
                extension: '.xml',
                contentType: 'application/xml; charset=windows-1250',
            });

            return {
                filename: `${invoice.invoiceNumber}.xml`,
                location: stored.location,
                size: stored.size,
            };
        } catch (error: any) {
            throw new Error(`Chyba při ukládání Pohoda XML: ${error.message}`);
        }
    }
}

export default PohodaExport;
