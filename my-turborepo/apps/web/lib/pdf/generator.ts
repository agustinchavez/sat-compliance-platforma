/**
 * PDF Generator (Component 16)
 *
 * Core layout engine for generating SAT-compliant CFDI PDFs using PDFKit.
 * This class orchestrates all section rendering and handles pagination.
 */

import PDFDocument = require('pdfkit');
import type {
  InvoicePDFData,
  BrandingSettings,
  PDFOptions,
  PDFGenerationResult,
  LayoutConfig,
} from './types';
import {
  buildLayoutConfig,
  getLabels,
  getCatalogLabel,
  getTaxLabel,
  formatTaxRate,
  TIPO_COMPROBANTE,
  FORMA_PAGO,
  METODO_PAGO,
  USO_CFDI,
  REGIMEN_FISCAL,
  ITEMS_TABLE_COLUMNS,
  ITEMS_TABLE_COLUMNS_NO_DISCOUNT,
  type Labels,
  type ItemsTableColumns,
  type ItemsTableColumnsNoDiscount,
} from './styles';
import { extractXMLFields } from './xml-extractor';
import { generateInvoiceQRCode, formatSATVerificationURL } from './qr-code';

// ============================================================================
// Constants
// ============================================================================

const HEADER_HEIGHT = 70;
const SECTION_PADDING = 10;
const TABLE_ROW_HEIGHT = 18;
const TABLE_HEADER_HEIGHT = 20;
const STAMP_BLOCK_HEIGHT = 120;
const FOOTER_HEIGHT = 100;

// ============================================================================
// PDFGenerator Class
// ============================================================================

export class PDFGenerator {
  private doc: PDFKit.PDFDocument;
  private layout: LayoutConfig;
  private labels: Labels;
  private options: PDFOptions;
  private branding: BrandingSettings;
  private currentY: number;
  private pageCount: number;
  private readonly pageSize: 'LETTER' | 'A4';

  constructor(options: PDFOptions, branding: BrandingSettings) {
    this.options = {
      language: options.language || 'es',
      pageSize: options.pageSize || 'LETTER',
      includeXMLAppendix: options.includeXMLAppendix || false,
      watermark: options.watermark || null,
    };
    this.branding = branding;
    this.pageSize = this.options.pageSize;
    this.layout = buildLayoutConfig(this.pageSize, {
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
    });
    this.labels = getLabels(this.options.language);
    this.currentY = this.layout.margin.top;
    this.pageCount = 1;

    // Initialize PDFDocument
    this.doc = new PDFDocument({
      size: this.pageSize,
      margins: {
        top: this.layout.margin.top,
        bottom: this.layout.margin.bottom,
        left: this.layout.margin.left,
        right: this.layout.margin.right,
      },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: 'CFDI 4.0',
        Author: branding.companyName || 'SAT Compliance Platform',
        Creator: 'Component 16 PDF Generator',
      },
    });
  }

  /**
   * Generates a complete invoice PDF buffer.
   * Orchestrates all section methods in order.
   */
  async generate(data: InvoicePDFData): Promise<PDFGenerationResult> {
    // Extract XML fields for sello display
    const xmlFields = extractXMLFields(data.cfdiXml);

    // Generate QR code
    const qrBuffer = await generateInvoiceQRCode({
      uuid: data.stamps.uuid,
      rfcEmisor: data.issuerRfc,
      rfcReceptor: data.receiverRfc,
      total: data.total,
      sello: xmlFields.selloEmisor,
    });

    // Add header
    await this.addHeader(data);

    // Add issuer and metadata blocks
    this.addIssuerAndMetadata(data);

    // Add receiver block
    this.addReceiverInfo(data);

    // Add items table
    this.addItemsTable(data);

    // Add totals
    this.addTotals(data);

    // Add stamp block
    this.addStampBlock(data, xmlFields);

    // Add footer with QR
    await this.addFooter(data, qrBuffer, xmlFields);

    // Add watermark if specified
    if (this.options.watermark) {
      this.addWatermark(this.options.watermark);
    }

    // Generate buffer
    const buffer = await this.generateBuffer();

    return {
      buffer,
      pageCount: this.pageCount,
      uuid: data.stamps.uuid,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Private Section Methods ─────────────────────────────────────────────

  /**
   * Blue header bar with company name/logo and invoice type label
   */
  private async addHeader(data: InvoicePDFData): Promise<void> {
    const { margin, contentWidth, colors, fonts } = this.layout;
    const headerY = margin.top;

    // Draw header background
    this.drawRect(margin.left, headerY, contentWidth, HEADER_HEIGHT, colors.headerBg);

    // Company logo or name
    let logoEndX = margin.left + 15;
    if (this.branding.logoBuffer) {
      try {
        this.doc.image(this.branding.logoBuffer, margin.left + 10, headerY + 10, {
          fit: [120, 50],
        });
        logoEndX = margin.left + 140;
      } catch {
        // If logo fails, fall back to text
        this.doc
          .font(fonts.bold)
          .fontSize(fonts.sizes.title)
          .fillColor(colors.white)
          .text(this.branding.companyName || data.issuerName, margin.left + 15, headerY + 20, {
            width: 200,
          });
        logoEndX = margin.left + 220;
      }
    } else {
      this.doc
        .font(fonts.bold)
        .fontSize(fonts.sizes.title)
        .fillColor(colors.white)
        .text(this.branding.companyName || data.issuerName, margin.left + 15, headerY + 20, {
          width: 200,
        });
      logoEndX = margin.left + 220;
    }

    // Invoice type and CFDI label (right side)
    const rightX = margin.left + contentWidth - 180;
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.large)
      .fillColor(colors.white)
      .text(this.labels.invoice, rightX, headerY + 12, { width: 170, align: 'right' });

    this.doc
      .font(fonts.regular)
      .fontSize(fonts.sizes.small)
      .text(this.labels.cfdiVersion, rightX, headerY + 28, { width: 170, align: 'right' });

    // Folio
    const folioText = data.series ? `${data.series}-${data.folio}` : data.folio;
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.medium)
      .text(`${this.labels.folio}: ${folioText}`, rightX, headerY + 44, {
        width: 170,
        align: 'right',
      });

    this.currentY = headerY + HEADER_HEIGHT + SECTION_PADDING;
  }

  /**
   * Issuer block (left) and invoice metadata block (right) — two-column
   */
  private addIssuerAndMetadata(data: InvoicePDFData): void {
    const { margin, contentWidth, colors, fonts } = this.layout;
    const startY = this.currentY;
    const halfWidth = contentWidth / 2 - 5;

    // Section header
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.normal)
      .fillColor(colors.primary)
      .text(this.labels.issuer, margin.left, startY);

    const issuerStartY = startY + 15;

    // Issuer details
    this.doc
      .font(fonts.regular)
      .fontSize(fonts.sizes.normal)
      .fillColor(colors.text);

    const issuerLines = [
      `${this.labels.rfc}: ${data.issuerRfc}`,
      data.issuerName,
      `${this.labels.taxRegime}: ${getCatalogLabel(REGIMEN_FISCAL, data.issuerTaxRegime)}`,
      `${this.labels.postalCode}: ${data.issuerPostalCode}`,
    ];

    let lineY = issuerStartY;
    issuerLines.forEach((line) => {
      this.doc.text(line, margin.left, lineY, { width: halfWidth });
      lineY += 12;
    });

    // Metadata (right column)
    const rightX = margin.left + halfWidth + 10;
    lineY = issuerStartY;

    const metadataLines = [
      `${this.labels.date}: ${this.formatDate(data.fecha)}`,
      `${this.labels.cfdiType}: ${getCatalogLabel(TIPO_COMPROBANTE, data.tipoComprobante)}`,
      `${this.labels.paymentForm}: ${getCatalogLabel(FORMA_PAGO, data.formaPago)}`,
      `${this.labels.paymentMethod}: ${getCatalogLabel(METODO_PAGO, data.metodoPago)}`,
      `${this.labels.currency}: ${data.moneda}${data.tipoCambio ? ` (TC: ${data.tipoCambio})` : ''}`,
      `${this.labels.issuePlace}: ${data.issuerPostalCode}`,
    ];

    metadataLines.forEach((line) => {
      this.doc.text(line, rightX, lineY, { width: halfWidth });
      lineY += 12;
    });

    this.currentY = Math.max(lineY, startY + issuerLines.length * 12 + 15) + SECTION_PADDING;

    // Draw separator
    this.drawRule(this.currentY);
    this.currentY += 8;
  }

  /**
   * Receiver block with RFC, name, tax regime, CFDI use
   */
  private addReceiverInfo(data: InvoicePDFData): void {
    const { margin, contentWidth, colors, fonts } = this.layout;
    const startY = this.currentY;
    const halfWidth = contentWidth / 2 - 5;

    // Section header
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.normal)
      .fillColor(colors.primary)
      .text(this.labels.receiver, margin.left, startY);

    const receiverStartY = startY + 15;

    this.doc
      .font(fonts.regular)
      .fontSize(fonts.sizes.normal)
      .fillColor(colors.text);

    // Left column
    const leftLines = [
      `${this.labels.rfc}: ${data.receiverRfc}`,
      data.receiverName,
      `${this.labels.taxRegime}: ${getCatalogLabel(REGIMEN_FISCAL, data.receiverTaxRegime)}`,
    ];

    let lineY = receiverStartY;
    leftLines.forEach((line) => {
      this.doc.text(line, margin.left, lineY, { width: halfWidth });
      lineY += 12;
    });

    // Right column
    const rightX = margin.left + halfWidth + 10;
    lineY = receiverStartY;

    const rightLines = [
      `${this.labels.postalCode}: ${data.receiverPostalCode}`,
      `${this.labels.cfdiUse}: ${getCatalogLabel(USO_CFDI, data.receiverCfdiUse)}`,
    ];

    if (data.condicionesDePago) {
      rightLines.push(`${this.labels.conditions}: ${data.condicionesDePago}`);
    }

    rightLines.forEach((line) => {
      this.doc.text(line, rightX, lineY, { width: halfWidth });
      lineY += 12;
    });

    this.currentY = Math.max(lineY, receiverStartY + leftLines.length * 12) + SECTION_PADDING;

    // Draw separator
    this.drawRule(this.currentY);
    this.currentY += 8;
  }

  /**
   * Items table with column headers, row data, page-aware auto-pagination
   */
  private addItemsTable(data: InvoicePDFData): void {
    const { margin, contentWidth, colors, fonts } = this.layout;

    // Check if any items have discounts
    const hasDiscounts = data.items.some((item) => item.discount && parseFloat(item.discount) > 0);
    const columns = hasDiscounts ? ITEMS_TABLE_COLUMNS : ITEMS_TABLE_COLUMNS_NO_DISCOUNT;

    // Section header
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.normal)
      .fillColor(colors.primary)
      .text(this.labels.items, margin.left, this.currentY);

    this.currentY += 15;

    // Draw table header
    this.drawTableHeader(columns, hasDiscounts);

    // Draw rows
    data.items.forEach((item) => {
      this.ensureSpace(TABLE_ROW_HEIGHT + 5);
      this.drawTableRow(item, columns, hasDiscounts);
    });

    this.currentY += SECTION_PADDING;
  }

  private drawTableHeader(columns: ItemsTableColumns | ItemsTableColumnsNoDiscount, hasDiscounts: boolean): void {
    const { margin, colors, fonts } = this.layout;
    const headerY = this.currentY;

    // Header background
    this.drawRect(margin.left, headerY, this.layout.contentWidth, TABLE_HEADER_HEIGHT, colors.secondary);

    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.small)
      .fillColor(colors.text);

    let x = margin.left + 2;

    // Column headers
    this.doc.text(this.labels.claveProdServ, x, headerY + 5, { width: columns.claveProdServ - 4 });
    x += columns.claveProdServ;

    this.doc.text(this.labels.qty, x, headerY + 5, { width: columns.quantity - 4, align: 'right' });
    x += columns.quantity;

    this.doc.text(this.labels.unit, x, headerY + 5, { width: columns.unit - 4 });
    x += columns.unit;

    this.doc.text(this.labels.description, x, headerY + 5, { width: columns.description - 4 });
    x += columns.description;

    this.doc.text(this.labels.unitPrice, x, headerY + 5, { width: columns.unitPrice - 4, align: 'right' });
    x += columns.unitPrice;

    if (hasDiscounts && 'discount' in columns) {
      this.doc.text(this.labels.discount, x, headerY + 5, { width: columns.discount - 4, align: 'right' });
      x += columns.discount;
    }

    this.doc.text(this.labels.amount, x, headerY + 5, { width: columns.subtotal - 4, align: 'right' });

    this.currentY = headerY + TABLE_HEADER_HEIGHT;
  }

  private drawTableRow(
    item: InvoicePDFData['items'][0],
    columns: ItemsTableColumns | ItemsTableColumnsNoDiscount,
    hasDiscounts: boolean
  ): void {
    const { margin, colors, fonts } = this.layout;
    const rowY = this.currentY;

    // Alternate row background
    // (Simple implementation - every other row)

    this.doc
      .font(fonts.regular)
      .fontSize(fonts.sizes.small)
      .fillColor(colors.text);

    let x = margin.left + 2;

    // ClaveProdServ
    this.doc.text(item.productServiceKey, x, rowY + 3, { width: columns.claveProdServ - 4 });
    x += columns.claveProdServ;

    // Cantidad
    this.doc.text(item.cantidad, x, rowY + 3, { width: columns.quantity - 4, align: 'right' });
    x += columns.quantity;

    // Unidad
    this.doc.text(item.unitKey, x, rowY + 3, { width: columns.unit - 4 });
    x += columns.unit;

    // Descripción (may wrap)
    const descHeight = this.doc.heightOfString(item.description, { width: columns.description - 4 });
    this.doc.text(item.description, x, rowY + 3, { width: columns.description - 4 });
    x += columns.description;

    // Valor Unitario
    this.doc.text(this.formatCurrency(item.unitPrice), x, rowY + 3, {
      width: columns.unitPrice - 4,
      align: 'right',
    });
    x += columns.unitPrice;

    // Descuento (if applicable)
    if (hasDiscounts && 'discount' in columns) {
      this.doc.text(
        item.discount ? this.formatCurrency(item.discount) : '-',
        x,
        rowY + 3,
        { width: columns.discount - 4, align: 'right' }
      );
      x += columns.discount;
    }

    // Importe
    this.doc.text(this.formatCurrency(item.subtotal), x, rowY + 3, {
      width: columns.subtotal - 4,
      align: 'right',
    });

    // Calculate row height based on description wrapping
    const rowHeight = Math.max(TABLE_ROW_HEIGHT, descHeight + 6);
    this.currentY = rowY + rowHeight;

    // Draw bottom border
    this.doc
      .strokeColor(colors.border)
      .lineWidth(0.5)
      .moveTo(margin.left, this.currentY)
      .lineTo(margin.left + this.layout.contentWidth, this.currentY)
      .stroke();
  }

  /**
   * Totals block: subtotal, taxes (each line), total
   */
  private addTotals(data: InvoicePDFData): void {
    const { margin, contentWidth, colors, fonts } = this.layout;

    this.ensureSpace(100);

    const totalsX = margin.left + contentWidth - 200;
    const labelX = totalsX;
    const valueX = totalsX + 100;
    let y = this.currentY + 10;

    this.doc.font(fonts.regular).fontSize(fonts.sizes.normal).fillColor(colors.text);

    // Subtotal
    this.doc.text(this.labels.subtotal + ':', labelX, y, { width: 95, align: 'right' });
    this.doc.text(this.formatCurrency(data.taxBreakdown.subtotal), valueX, y, { width: 95, align: 'right' });
    y += 14;

    // Discount (if any)
    if (data.taxBreakdown.discount && parseFloat(data.taxBreakdown.discount) > 0) {
      this.doc.text(this.labels.discount_total + ':', labelX, y, { width: 95, align: 'right' });
      this.doc.text('-' + this.formatCurrency(data.taxBreakdown.discount), valueX, y, {
        width: 95,
        align: 'right',
      });
      y += 14;
    }

    // Individual taxes
    data.taxBreakdown.taxes.forEach((tax) => {
      const taxName = getTaxLabel(tax.impuesto);
      const rate = formatTaxRate(tax.tasaOCuota);
      const typeLabel = tax.type === 'transferred' ? '' : ` (${this.labels.taxWithheld})`;
      const prefix = tax.type === 'withheld' ? '-' : '';

      this.doc.text(`${taxName} ${rate}${typeLabel}:`, labelX, y, { width: 95, align: 'right' });
      this.doc.text(prefix + this.formatCurrency(tax.importe), valueX, y, { width: 95, align: 'right' });
      y += 14;
    });

    // Total (bold, larger)
    y += 5;
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.large)
      .fillColor(colors.primary);

    this.doc.text(this.labels.total + ':', labelX, y, { width: 95, align: 'right' });
    this.doc.text(this.formatCurrency(data.total, data.moneda), valueX, y, { width: 95, align: 'right' });

    this.currentY = y + 25;
    this.drawRule(this.currentY);
    this.currentY += 8;
  }

  /**
   * TFD stamp block: UUID, dates, seals, certificate numbers
   */
  private addStampBlock(
    data: InvoicePDFData,
    xmlFields: ReturnType<typeof extractXMLFields>
  ): void {
    const { margin, contentWidth, colors, fonts } = this.layout;

    this.ensureSpace(STAMP_BLOCK_HEIGHT);

    // Section header
    this.doc
      .font(fonts.bold)
      .fontSize(fonts.sizes.normal)
      .fillColor(colors.primary)
      .text(this.labels.stampData, margin.left, this.currentY);

    this.currentY += 15;

    this.doc.font(fonts.regular).fontSize(fonts.sizes.tiny).fillColor(colors.text);

    const stampLines = [
      { label: this.labels.fiscalFolio, value: data.stamps.uuid },
      { label: this.labels.stampDate, value: this.formatDateTime(data.stamps.fechaTimbrado) },
      { label: this.labels.pacRfc, value: data.stamps.rfcProvCertif },
      { label: this.labels.satCertNo, value: data.stamps.noCertificadoSAT },
      { label: this.labels.issuerCertNo, value: xmlFields.noCertificadoEmisor },
    ];

    stampLines.forEach((line) => {
      this.doc.text(`${line.label}: ${line.value}`, margin.left, this.currentY, { width: contentWidth });
      this.currentY += 10;
    });

    // Seals (truncated for display)
    this.currentY += 3;
    this.doc.text(
      `${this.labels.issuerSeal}: ${xmlFields.selloEmisorDisplay}`,
      margin.left,
      this.currentY,
      { width: contentWidth }
    );
    this.currentY += 10;

    this.doc.text(
      `${this.labels.satSeal}: ${xmlFields.selloSATDisplay}`,
      margin.left,
      this.currentY,
      { width: contentWidth }
    );
    this.currentY += 15;
  }

  /**
   * Footer with QR code (left) and verification text (right)
   */
  private async addFooter(
    data: InvoicePDFData,
    qrBuffer: Buffer,
    xmlFields: ReturnType<typeof extractXMLFields>
  ): Promise<void> {
    const { margin, contentWidth, colors, fonts } = this.layout;

    this.ensureSpace(FOOTER_HEIGHT);

    const footerY = this.currentY;

    // QR Code (left side)
    this.doc.image(qrBuffer, margin.left, footerY, { width: 80, height: 80 });

    // Verification text (right of QR)
    const textX = margin.left + 95;

    this.doc.font(fonts.regular).fontSize(fonts.sizes.small).fillColor(colors.muted);

    this.doc.text(this.labels.verifyAt, textX, footerY, { width: contentWidth - 100 });
    this.doc.text(this.labels.verifyUrl, textX, footerY + 12, { width: contentWidth - 100 });

    this.doc.fontSize(fonts.sizes.tiny);
    this.doc.text(this.labels.generatedBy, textX, footerY + 30, { width: contentWidth - 100 });

    // SAT verification URL in small text
    const verificationUrl = formatSATVerificationURL({
      uuid: data.stamps.uuid,
      rfcEmisor: data.issuerRfc,
      rfcReceptor: data.receiverRfc,
      total: data.total,
      sello: xmlFields.selloEmisor,
    });

    this.doc.fontSize(5);
    this.doc.text(verificationUrl, textX, footerY + 50, { width: contentWidth - 100 });

    this.currentY = footerY + FOOTER_HEIGHT;
  }

  // ─── Utility Methods ─────────────────────────────────────────────────────

  /**
   * Draws a horizontal rule line
   */
  private drawRule(y: number, color?: string): void {
    const { margin, contentWidth, colors } = this.layout;

    this.doc
      .strokeColor(color || colors.border)
      .lineWidth(0.5)
      .moveTo(margin.left, y)
      .lineTo(margin.left + contentWidth, y)
      .stroke();
  }

  /**
   * Adds a new page and resets currentY, increments pageCount
   */
  private addPage(): void {
    this.doc.addPage();
    this.pageCount++;
    this.currentY = this.layout.margin.top;

    // Add page number on new pages
    if (this.pageCount > 1) {
      this.addPageNumber();
    }
  }

  /**
   * Adds page number to current page
   */
  private addPageNumber(): void {
    const { margin, contentWidth, fonts, colors } = this.layout;
    const pageText = `${this.labels.page} ${this.pageCount}`;

    this.doc
      .font(fonts.regular)
      .fontSize(fonts.sizes.small)
      .fillColor(colors.muted)
      .text(pageText, margin.left + contentWidth - 60, margin.top - 20, {
        width: 60,
        align: 'right',
      });
  }

  /**
   * Checks if there's enough vertical space remaining on the page.
   * If not, calls addPage().
   */
  private ensureSpace(minHeight: number): void {
    const { pageHeight, margin } = this.layout;
    const availableSpace = pageHeight - margin.bottom - this.currentY;

    if (availableSpace < minHeight) {
      this.addPage();
    }
  }

  /**
   * Draws a filled rectangle
   */
  private drawRect(x: number, y: number, w: number, h: number, color: string): void {
    this.doc.rect(x, y, w, h).fill(color);
  }

  /**
   * Formats a decimal string as Mexican currency: "$1,234.56"
   */
  private formatCurrency(value: string, currency = 'MXN'): string {
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    const formatted = num.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return currency === 'MXN' ? `$${formatted}` : `${formatted} ${currency}`;
  }

  /**
   * Formats ISO date string for display: "01/03/2024"
   */
  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString(this.options.language === 'es' ? 'es-MX' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Formats ISO datetime for display
   */
  private formatDateTime(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleString(this.options.language === 'es' ? 'es-MX' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Adds a watermark to all pages
   */
  private addWatermark(text: string): void {
    const { pageWidth, pageHeight, fonts } = this.layout;
    const pages = this.doc.bufferedPageRange();

    for (let i = pages.start; i < pages.start + pages.count; i++) {
      this.doc.switchToPage(i);

      this.doc
        .font(fonts.bold)
        .fontSize(60)
        .fillColor('#CCCCCC')
        .opacity(0.3)
        .rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] })
        .text(text, 0, pageHeight / 2, { width: pageWidth, align: 'center' })
        .rotate(45, { origin: [pageWidth / 2, pageHeight / 2] })
        .opacity(1);
    }
  }

  /**
   * Generates the PDF buffer
   */
  private async generateBuffer(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      this.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);

      this.doc.end();
    });
  }
}
