const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
  constructor() {
    this.doc = null;
    this.currentY = 50;
    this.pageMargin = 50;
    this.pageWidth = 595.28; // A4 width in points
    this.pageHeight = 841.89; // A4 height in points
  }

  async generateInvoice(invoice, workRecords, services, hardware, organization) {
    return new Promise((resolve, reject) => {
      try {
        // Vytvoř PDF dokument
        this.doc = new PDFDocument({
          size: 'A4',
          margin: this.pageMargin,
          info: {
            Title: `Faktura ${invoice.invoiceNumber}`,
            Author: process.env.COMPANY_NAME || 'Fakturační systém',
            Subject: `Faktura za ${invoice.month}/${invoice.year}`
          }
        });

        const buffers = [];
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

  _drawHeader(invoice) {
    // Nadpis
    this.doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('FAKTURA', this.pageMargin, this.currentY, {
        align: 'center'
      });

    this.currentY += 40;

    // Číslo faktury
    this.doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Číslo faktury: ${invoice.invoiceNumber}`, this.pageMargin, this.currentY, {
        align: 'center'
      });

    this.currentY += 40;
  }

  _drawSupplier() {
    const leftCol = this.pageMargin;
    const colWidth = (this.pageWidth - 2 * this.pageMargin) / 2;

    this.doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Dodavatel:', leftCol, this.currentY);

    this.currentY += 20;

    this.doc
      .fontSize(10)
      .font('Helvetica');

    const supplierData = [
      process.env.COMPANY_NAME || 'Vaše firma s.r.o.',
      'Adresa firmy 123',
      '100 00 Praha 1',
      '',
      `IČO: ${process.env.COMPANY_ICO || '12345678'}`,
      `DIČ: ${process.env.COMPANY_DIC || 'CZ12345678'}`,
      '',
      'Bankovní spojení:',
      'Číslo účtu: 1234567890/0100'
    ];

    supplierData.forEach(line => {
      this.doc.text(line, leftCol, this.currentY);
      this.currentY += 15;
    });
  }

  _drawCustomer(organization) {
    const rightCol = this.pageMargin + (this.pageWidth - 2 * this.pageMargin) / 2 + 20;
    let customerY = 170;

    this.doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Odběratel:', rightCol, customerY);

    customerY += 20;

    this.doc
      .fontSize(10)
      .font('Helvetica');

    const customerData = [
      organization.name,
      organization.address || '',
      '',
      organization.ico ? `IČO: ${organization.ico}` : '',
      organization.dic ? `DIČ: ${organization.dic}` : '',
      '',
      organization.contactPerson ? `Kontakt: ${organization.contactPerson}` : '',
      organization.email || '',
      organization.phone || ''
    ];

    customerData.forEach(line => {
      if (line) {
        this.doc.text(line, rightCol, customerY);
        customerY += 15;
      }
    });

    // Posuň currentY na konec sekce
    this.currentY = Math.max(this.currentY, customerY + 20);
  }

  _drawInvoiceInfo(invoice) {
    // Oddělující čára
    this.doc
      .moveTo(this.pageMargin, this.currentY)
      .lineTo(this.pageWidth - this.pageMargin, this.currentY)
      .stroke();

    this.currentY += 20;

    const infoY = this.currentY;
    const leftCol = this.pageMargin;
    const rightCol = this.pageMargin + (this.pageWidth - 2 * this.pageMargin) / 2 + 20;

    this.doc
      .fontSize(10)
      .font('Helvetica');

    // Levý sloupec
    this.doc.text(`Datum vystavení: ${this._formatDate(invoice.generatedAt)}`, leftCol, infoY);
    this.doc.text(`Datum zdanitelného plnění: ${this._formatDate(invoice.generatedAt)}`, leftCol, infoY + 20);
    this.doc.text(`Datum splatnosti: ${this._formatDate(this._addDays(invoice.generatedAt, 14))}`, leftCol, infoY + 40);

    // Pravý sloupec
    this.doc.text(`Forma úhrady: Převodem`, rightCol, infoY);
    this.doc.text(`Variabilní symbol: ${invoice.invoiceNumber}`, rightCol, infoY + 20);

    this.currentY = infoY + 80;
  }

  _drawInvoiceItems(workRecords, services, hardware, organization) {
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
      total: 80
    };

    this.doc
      .fontSize(10)
      .font('Helvetica-Bold');

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

    this.doc
      .fontSize(9)
      .font('Helvetica');

    // Paušální služby
    if (services && services.length > 0) {
      services.forEach(service => {
        if (service.isActive) {
          xPos = tableLeft;
          this.doc.text(service.serviceName, xPos, this.currentY, { width: colWidths.description });
          xPos += colWidths.description;
          this.doc.text('1', xPos, this.currentY, { width: colWidths.quantity, align: 'right' });
          xPos += colWidths.quantity;
          this.doc.text('měs.', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
          xPos += colWidths.unit;
          this.doc.text(`${parseFloat(service.monthlyPrice).toFixed(2)}`, xPos, this.currentY, { width: colWidths.unitPrice, align: 'right' });
          xPos += colWidths.unitPrice;
          this.doc.text(`${parseFloat(service.monthlyPrice).toFixed(2)}`, xPos, this.currentY, { width: colWidths.total, align: 'right' });
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
        this.doc.text(totalHours.toFixed(2), xPos, this.currentY, { width: colWidths.quantity, align: 'right' });
        xPos += colWidths.quantity;
        this.doc.text('hod', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
        xPos += colWidths.unit;
        this.doc.text(`${parseFloat(organization.hourlyRate).toFixed(2)}`, xPos, this.currentY, { width: colWidths.unitPrice, align: 'right' });
        xPos += colWidths.unitPrice;
        this.doc.text(`${(totalHours * parseFloat(organization.hourlyRate)).toFixed(2)}`, xPos, this.currentY, { width: colWidths.total, align: 'right' });
        this.currentY += 20;
      }

      // Cestovné
      if (totalKm > 0) {
        xPos = tableLeft;
        this.doc.text('Cestovné', xPos, this.currentY, { width: colWidths.description });
        xPos += colWidths.description;
        this.doc.text(totalKm.toString(), xPos, this.currentY, { width: colWidths.quantity, align: 'right' });
        xPos += colWidths.quantity;
        this.doc.text('km', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
        xPos += colWidths.unit;
        this.doc.text(`${parseFloat(organization.kmRate).toFixed(2)}`, xPos, this.currentY, { width: colWidths.unitPrice, align: 'right' });
        xPos += colWidths.unitPrice;
        this.doc.text(`${(totalKm * parseFloat(organization.kmRate)).toFixed(2)}`, xPos, this.currentY, { width: colWidths.total, align: 'right' });
        this.currentY += 20;
      }
    }

    // Hardware
    if (hardware && hardware.length > 0) {
      hardware.forEach(item => {
        xPos = tableLeft;
        this.doc.text(item.itemName, xPos, this.currentY, { width: colWidths.description });
        xPos += colWidths.description;
        this.doc.text(item.quantity.toString(), xPos, this.currentY, { width: colWidths.quantity, align: 'right' });
        xPos += colWidths.quantity;
        this.doc.text('ks', xPos, this.currentY, { width: colWidths.unit, align: 'center' });
        xPos += colWidths.unit;
        this.doc.text(`${parseFloat(item.unitPrice).toFixed(2)}`, xPos, this.currentY, { width: colWidths.unitPrice, align: 'right' });
        xPos += colWidths.unitPrice;
        this.doc.text(`${parseFloat(item.totalPrice).toFixed(2)}`, xPos, this.currentY, { width: colWidths.total, align: 'right' });
        this.currentY += 20;
      });
    }

    this.currentY += 10;
  }

  _drawSummary(invoice) {
    // Oddělující čára
    this.doc
      .moveTo(this.pageMargin, this.currentY)
      .lineTo(this.pageWidth - this.pageMargin, this.currentY)
      .stroke();

    this.currentY += 20;

    const rightCol = this.pageWidth - this.pageMargin - 200;
    
    this.doc
      .fontSize(10)
      .font('Helvetica');

    // Celkem bez DPH
    this.doc.text('Celkem bez DPH:', rightCol, this.currentY);
    this.doc.text(`${parseFloat(invoice.totalAmount).toFixed(2)} Kč`, rightCol + 120, this.currentY, { align: 'right' });
    this.currentY += 20;

    // DPH
    this.doc.text('DPH 21%:', rightCol, this.currentY);
    this.doc.text(`${parseFloat(invoice.totalVat).toFixed(2)} Kč`, rightCol + 120, this.currentY, { align: 'right' });
    this.currentY += 20;

    // Celkem s DPH
    this.doc
      .fontSize(12)
      .font('Helvetica-Bold');
    this.doc.text('Celkem k úhradě:', rightCol, this.currentY);
    const totalWithVat = parseFloat(invoice.totalAmount) + parseFloat(invoice.totalVat);
    this.doc.text(`${totalWithVat.toFixed(2)} Kč`, rightCol + 120, this.currentY, { align: 'right' });

    this.currentY += 40;
  }

  _drawFooter() {
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
      .text('Vystavil: _______________________', this.pageWidth - this.pageMargin - 200, this.currentY);
  }

  _formatDate(date) {
    const d = new Date(date);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  }

  _addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  async saveInvoicePDF(invoice, workRecords, services, hardware, organization) {
    try {
      const pdfBuffer = await this.generateInvoice(invoice, workRecords, services, hardware, organization);
      
      // Vytvoř adresář pro faktury pokud neexistuje
      const invoicesDir = path.join(__dirname, '../../uploads/invoices');
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      // Uložení souboru
      const filename = `${invoice.invoiceNumber}.pdf`;
      const filepath = path.join(invoicesDir, filename);
      
      fs.writeFileSync(filepath, pdfBuffer);

      return {
        filename,
        path: `/uploads/invoices/${filename}`,
        size: pdfBuffer.length
      };
    } catch (error) {
      throw new Error(`Chyba při ukládání PDF: ${error.message}`);
    }
  }
}

module.exports = PDFGenerator;