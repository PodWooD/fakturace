import PDFDocument from 'pdfkit';
import * as storageService from './storageService';
import { ReceivedInvoiceItem, Service, Hardware, Organization, Invoice } from '@prisma/client';

export class PDFGenerator {
    private doc: PDFDocument | null = null;
    private currentY: number = 50;
    private pageMargin: number = 50;
    private pageWidth: number = 595.28; // A4 width in points
    private pageHeight: number = 841.89; // A4 height in points

    constructor() { }

    async generateInvoice(
        invoice: any, // Using any for Invoice as it might be a composite type with relations
        workRecords: any[],
        services: Service[],
        hardware: Hardware[],
        organization: Organization
    ): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                // Vytvoř PDF dokument
                this.doc = new PDFDocument({
                    size: 'A4',
                    margin: this.pageMargin,
                    info: {
                        Title: `Faktura ${invoice.invoiceNumber}`,
                        Author: process.env.COMPANY_NAME || 'Fakturační systém',
                        Subject: `Faktura za ${invoice.month}/${invoice.year}`,
                    },
                });

                const buffers: Buffer[] = [];
                this.doc.on('data', buffers.push.bind(buffers));
                this.doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                // Hlavička faktury
                this._drawHeader(invoice);

                // Dodavatel
                this._drawSupplier();

                // Odběratel
                this._drawCustomer(organization);

                // Fakturační údaje
                this._drawInvoiceInfo(invoice);

                // Položky faktury
                this._drawInvoiceItems(workRecords, services, hardware, organization);

                // Souhrn
                this._drawSummary(invoice);

                // Patička
                this._drawFooter();

                // Konec dokumentu
                this.doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    private _drawHeader(invoice: any) {
        if (!this.doc) return;
        // Nadpis
        this.doc
            .fontSize(24)
            .font('Helvetica-Bold')
            .text('FAKTURA', this.pageMargin, this.currentY, {
                align: 'center',
            });

        this.currentY += 40;

        // Číslo faktury
        this.doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(`Číslo faktury: ${invoice.invoiceNumber}`, this.pageMargin, this.currentY, {
                align: 'center',
            });

        this.currentY += 40;
    }

    private _drawSupplier() {
        if (!this.doc) return;

        const leftCol = this.pageMargin;

        this.doc.fontSize(12).font('Helvetica-Bold').text('Dodavatel:', leftCol, this.currentY);

        this.currentY += 20;

        this.doc.fontSize(10).font('Helvetica');

        const supplierData = [
            process.env.COMPANY_NAME || 'Vaše firma s.r.o.',
            'Adresa firmy 123',
            '100 00 Praha 1',
            '',
            `IČO: ${process.env.COMPANY_ICO || '12345678'}`,
            `DIČ: ${process.env.COMPANY_DIC || 'CZ12345678'}`,
            '',
            'Bankovní spojení:',
            'Číslo účtu: 1234567890/0100',
        ];

        supplierData.forEach((line) => {
            this.doc!.text(line, leftCol, this.currentY);
            this.currentY += 15;
        });
    }

    private _drawCustomer(organization: Organization) {
        if (!this.doc) return;

        const rightCol = this.pageMargin + (this.pageWidth - 2 * this.pageMargin) / 2 + 20;
        let customerY = 170;

        this.doc.fontSize(12).font('Helvetica-Bold').text('Odběratel:', rightCol, customerY);

        customerY += 20;

        this.doc.fontSize(10).font('Helvetica');

        const customerData = [
            organization.name,
            organization.address || '',
            '',
            organization.ico ? `IČO: ${organization.ico}` : '',
            organization.dic ? `DIČ: ${organization.dic}` : '',
            '',
            organization.contactPerson ? `Kontakt: ${organization.contactPerson}` : '',
            organization.email || '',
            organization.phone || '',
        ];

        customerData.forEach((line) => {
            if (line) {
                this.doc!.text(line, rightCol, customerY);
                customerY += 15;
            }
        });

        // Posuň currentY na konec sekce
        this.currentY = Math.max(this.currentY, customerY + 20);
    }

    private _drawInvoiceInfo(invoice: any) {
        if (!this.doc) return;

        // Oddělující čára
        this.doc
            .moveTo(this.pageMargin, this.currentY)
            .lineTo(this.pageWidth - this.pageMargin, this.currentY)
            .stroke();

        this.currentY += 20;

        const infoY = this.currentY;
        const leftCol = this.pageMargin;
        const rightCol = this.pageMargin + (this.pageWidth - 2 * this.pageMargin) / 2 + 20;

        this.doc.fontSize(10).font('Helvetica');

        const issuedAt = invoice.generatedAt ? new Date(invoice.generatedAt) : new Date();
        const taxDate = invoice.generatedAt ? new Date(invoice.generatedAt) : issuedAt;
        const dueDateSource = invoice.dueDate ? new Date(invoice.dueDate) : issuedAt;
        const dueDate = Number.isNaN(dueDateSource.getTime())
            ? this._addDays(issuedAt, 14)
            : dueDateSource;

        // Levý sloupec
        this.doc.text(`Datum vystavení: ${this._formatDate(issuedAt)}`, leftCol, infoY);
        this.doc.text(`Datum zdanitelného plnění: ${this._formatDate(taxDate)}`, leftCol, infoY + 20);
        this.doc.text(`Datum splatnosti: ${this._formatDate(dueDate)}`, leftCol, infoY + 40);

        // Pravý sloupec
        this.doc.text(`Forma úhrady: Převodem`, rightCol, infoY);
        this.doc.text(`Variabilní symbol: ${invoice.invoiceNumber}`, rightCol, infoY + 20);

        this.currentY = infoY + 80;
    }

    private _drawInvoiceItems(
        workRecords: any[],
        services: Service[],
        hardware: Hardware[],
        organization: any // using any because Organization definition might lack calculated rates depending on how it's fetched
    ) {
        if (!this.doc) return;

        // Oddělující čára
        this.doc
            .moveTo(this.pageMargin, this.currentY)
            .lineTo(this.pageWidth - this.pageMargin, this.currentY)
            .stroke();

        this.currentY += 20;

        // Hlavička tabulky
        const tableTop = this.currentY;
        const tableLeft = this.pageMargin;
        const colWidths = {
            description: 250,
            quantity: 60,
            unit: 40,
            unitPrice: 80,
            total: 80,
        };

        this.doc.fontSize(10).font('Helvetica-Bold');

        let xPos = tableLeft;
        this.doc.text('Popis', xPos, tableTop);
        xPos += colWidths.description;
        this.doc.text('Množství', xPos, tableTop, { width: colWidths.quantity, align: 'right' });
        xPos += colWidths.quantity;
        this.doc.text('Jedn.', xPos, tableTop, { width: colWidths.unit, align: 'center' });
        xPos += colWidths.unit;
        this.doc.text('Cena/jedn.', xPos, tableTop, { width: colWidths.unitPrice, align: 'right' });
        xPos += colWidths.unitPrice;
        this.doc.text('Celkem', xPos, tableTop, { width: colWidths.total, align: 'right' });

        this.currentY += 25;

        // Čára pod hlavičkou
        this.doc
            .moveTo(tableLeft, this.currentY)
            .lineTo(this.pageWidth - this.pageMargin, this.currentY)
            .stroke();

        this.currentY += 10;

        this.doc.fontSize(9).font('Helvetica');

        // Paušální služby
        if (services && services.length > 0) {
            services.forEach((service) => {
                if (service.isActive) {
                    xPos = tableLeft;
                    this.doc!.text(service.serviceName, xPos, this.currentY, {
                        width: colWidths.description,
                    });
                    xPos += colWidths.description;
                    this.doc!.text('1', xPos, this.currentY, { width: colWidths.quantity, align: 'right' });
                    xPos += colWidths.quantity;
                    this.doc!.text('měs.', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
                    xPos += colWidths.unit;
                    // @ts-ignore - monthlyPrice is injected via mapService, not on Prisma type but expected here
                    const price = parseFloat(service.monthlyPrice || '0');
                    this.doc!.text(price.toFixed(2), xPos, this.currentY, {
                        width: colWidths.unitPrice,
                        align: 'right',
                    });
                    xPos += colWidths.unitPrice;
                    this.doc!.text(price.toFixed(2), xPos, this.currentY, {
                        width: colWidths.total,
                        align: 'right',
                    });
                    this.currentY += 20;
                }
            });
        }

        // Práce IT technika
        if (workRecords && workRecords.length > 0) {
            // Součet hodin
            const totalMinutes = workRecords.reduce((sum, record) => sum + record.minutes, 0);
            const totalHours = totalMinutes / 60;
            const totalKm = workRecords.reduce((sum, record) => sum + record.kilometers, 0);

            if (totalHours > 0) {
                xPos = tableLeft;
                this.doc.text('Práce IT technika', xPos, this.currentY, { width: colWidths.description });
                xPos += colWidths.description;
                this.doc.text(totalHours.toFixed(2), xPos, this.currentY, {
                    width: colWidths.quantity,
                    align: 'right',
                });
                xPos += colWidths.quantity;
                this.doc.text('hod', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
                xPos += colWidths.unit;
                this.doc.text(`${parseFloat(organization.hourlyRate).toFixed(2)}`, xPos, this.currentY, {
                    width: colWidths.unitPrice,
                    align: 'right',
                });
                xPos += colWidths.unitPrice;
                this.doc.text(
                    `${(totalHours * parseFloat(organization.hourlyRate)).toFixed(2)}`,
                    xPos,
                    this.currentY,
                    { width: colWidths.total, align: 'right' }
                );
                this.currentY += 20;
            }

            // Cestovné
            if (totalKm > 0) {
                xPos = tableLeft;
                this.doc.text('Cestovné', xPos, this.currentY, { width: colWidths.description });
                xPos += colWidths.description;
                this.doc.text(totalKm.toString(), xPos, this.currentY, {
                    width: colWidths.quantity,
                    align: 'right',
                });
                xPos += colWidths.quantity;
                this.doc.text('km', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
                xPos += colWidths.unit;
                this.doc.text(`${parseFloat(organization.kilometerRate).toFixed(2)}`, xPos, this.currentY, {
                    width: colWidths.unitPrice,
                    align: 'right',
                });
                xPos += colWidths.unitPrice;
                this.doc.text(
                    `${(totalKm * parseFloat(organization.kilometerRate)).toFixed(2)}`,
                    xPos,
                    this.currentY,
                    { width: colWidths.total, align: 'right' }
                );
                this.currentY += 20;
            }
        }

        // Hardware
        if (hardware && hardware.length > 0) {
            hardware.forEach((item: any) => {
                xPos = tableLeft;
                this.doc!.text(item.itemName, xPos, this.currentY, { width: colWidths.description });
                xPos += colWidths.description;
                this.doc!.text(item.quantity.toString(), xPos, this.currentY, {
                    width: colWidths.quantity,
                    align: 'right',
                });
                xPos += colWidths.quantity;
                this.doc!.text('ks', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
                xPos += colWidths.unit;
                this.doc!.text(`${parseFloat(item.unitPrice).toFixed(2)}`, xPos, this.currentY, {
                    width: colWidths.unitPrice,
                    align: 'right',
                });
                xPos += colWidths.unitPrice;
                this.doc!.text(`${parseFloat(item.totalPrice).toFixed(2)}`, xPos, this.currentY, {
                    width: colWidths.total,
                    align: 'right',
                });
                this.currentY += 20;
            });
        }

        this.currentY += 10;
    }

    private _drawSummary(invoice: any) {
        if (!this.doc) return;

        // Oddělující čára
        this.doc
            .moveTo(this.pageMargin, this.currentY)
            .lineTo(this.pageWidth - this.pageMargin, this.currentY)
            .stroke();

        this.currentY += 20;

        const rightCol = this.pageWidth - this.pageMargin - 200;

        this.doc.fontSize(10).font('Helvetica');

        // Celkem bez DPH
        this.doc.text('Celkem bez DPH:', rightCol, this.currentY);
        this.doc.text(
            `${parseFloat(invoice.totalAmount).toFixed(2)} Kč`,
            rightCol + 120,
            this.currentY,
            { align: 'right' }
        );
        this.currentY += 20;

        // DPH
        this.doc.text('DPH 21%:', rightCol, this.currentY);
        this.doc.text(`${parseFloat(invoice.totalVat).toFixed(2)} Kč`, rightCol + 120, this.currentY, {
            align: 'right',
        });
        this.currentY += 20;

        // Celkem s DPH
        this.doc.fontSize(12).font('Helvetica-Bold');
        this.doc.text('Celkem k úhradě:', rightCol, this.currentY);
        const totalWithVat = parseFloat(invoice.totalAmount) + parseFloat(invoice.totalVat);
        this.doc.text(`${totalWithVat.toFixed(2)} Kč`, rightCol + 120, this.currentY, {
            align: 'right',
        });

        this.currentY += 40;
    }

    private _drawFooter() {
        if (!this.doc) return;

        // Poznámka o DPH
        this.doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#666666')
            .text('Dodavatel je plátcem DPH.', this.pageMargin, this.currentY);

        // Podpis
        this.currentY = this.pageHeight - 100;

        this.doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor('#000000')
            .text(
                'Vystavil: _______________________',
                this.pageWidth - this.pageMargin - 200,
                this.currentY
            );
    }

    private _formatDate(date: any) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) {
            return '-';
        }
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    }

    private _addDays(date: Date, days: number) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    async saveInvoicePDF(
        invoice: any,
        workRecords: any[],
        services: Service[],
        hardware: Hardware[],
        organization: Organization
    ) {
        try {
            const pdfBuffer = await this.generateInvoice(
                invoice,
                workRecords,
                services,
                hardware,
                organization
            );

            const stored = await storageService.saveFile({
                buffer: pdfBuffer,
                prefix: 'exports/invoices',
                extension: '.pdf',
                contentType: 'application/pdf',
            });

            return {
                filename: `${invoice.invoiceNumber}.pdf`,
                location: stored.location,
                size: stored.size,
            };
        } catch (error: any) {
            throw new Error(`Chyba při ukládání PDF: ${error.message}`);
        }
    }
}

export default PDFGenerator;
