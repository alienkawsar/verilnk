import type { PlanType } from '@prisma/client';
import {
    buildInvoiceFooterWording,
    resolveInvoiceBillingMode
} from './invoice-wording-registry';

type InvoiceLineItem = {
    description: string;
    qty: number;
    unitPriceCents: number;
    totalCents?: number;
};

type InvoicePdfInput = {
    invoiceNumber: string;
    invoiceDate: Date;
    status?: string | null;
    dueAt?: Date | null;
    paidAt?: Date | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    planName?: string | null;
    planType?: PlanType | string | null;
    billingGateway?: string | null;
    billToCountryCode?: string | null;
    currency: string;
    subtotalCents?: number;
    amountCents: number;
    discountCents?: number;
    taxCents?: number;
    lineItems?: InvoiceLineItem[];
    billTo: {
        name: string;
        email?: string | null;
        website?: string | null;
        address?: string | null;
    };
    notes?: string | null;
    pageSize?: 'A4' | 'LETTER';
};

type NormalizedInvoiceStatus = 'PAID' | 'DRAFT' | 'VOID' | 'REFUNDED';

type InvoiceStatusTheme = {
    normalized: NormalizedInvoiceStatus;
    label: 'PAID' | 'DRAFT' | 'VOID' | 'REFUNDED';
    textColor: string;
};

const formatDate = (value?: Date | null) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
};

const formatMoney = (amountCents: number, currency: string) => {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amountCents / 100);
    } catch {
        return `${(amountCents / 100).toFixed(2)} ${currency || 'USD'}`;
    }
};

const toLineValue = (value?: string | null) => (value && value.trim() ? value.trim() : null);

const getInvoiceStatusTheme = (status?: string | null): InvoiceStatusTheme => {
    const normalized = (status || 'DRAFT').toUpperCase();

    if (normalized === 'PAID') {
        return {
            normalized: 'PAID',
            label: 'PAID',
            textColor: '#2E6B4E'
        };
    }

    if (normalized === 'VOID') {
        return {
            normalized: 'VOID',
            label: 'VOID',
            textColor: '#8A2C2C'
        };
    }

    if (normalized === 'REFUNDED') {
        return {
            normalized: 'REFUNDED',
            label: 'REFUNDED',
            textColor: '#9A3412'
        };
    }

    return {
        normalized: 'DRAFT',
        label: 'DRAFT',
        textColor: '#475569'
    };
};

export const buildInvoicePdfBuffer = async (input: InvoicePdfInput): Promise<Buffer> => {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: input.pageSize || 'A4', margin: 48 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const margin = doc.page.margins.left;
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const slate900 = '#101627';
        const slate700 = '#334155';
        const slate600 = '#475569';
        const slate500 = '#64748b';
        const slate300 = '#cbd5e1';
        const slate200 = '#e2e8f0';
        const slate100 = '#f8fafc';
        const brandDark = '#101627';
        const brandBlue = '#187DE9';
        const typeScale = {
            base: 10,
            invoiceTitle: 18,
            sectionHeading: 12,
            label: 9,
            body: 10,
            tableHeader: 9,
            footnote: 8,
            totalsLabel: 10,
            grandTotal: 14,
            status: 13
        };
        const lineHeight = {
            body: 1.35,
            heading: 1.2
        };
        const bodyLineGap = typeScale.base * (lineHeight.body - 1);
        const headingLineGap = typeScale.sectionHeading * (lineHeight.heading - 1);
        const headerPadding = 14;
        const blockGap = 8;
        const amountFeatures = { features: ['tnum' as any] };
        const statusTheme = getInvoiceStatusTheme(input.status);

        const discountCents = Math.max(0, input.discountCents || 0);
        const taxCents = Math.max(0, input.taxCents || 0);
        const normalizedLineItems = (input.lineItems && input.lineItems.length > 0)
            ? input.lineItems.map((item) => ({
                description: item.description || 'Subscription',
                qty: Math.max(1, Math.floor(item.qty || 1)),
                unitPriceCents: Math.max(0, Math.floor(item.unitPriceCents || 0)),
                totalCents: Math.max(
                    0,
                    Math.floor(
                        typeof item.totalCents === 'number'
                            ? item.totalCents
                            : (item.unitPriceCents || 0) * (item.qty || 1)
                    )
                )
            }))
            : [{
                description: `VeriLnk ${input.planName || input.planType || 'Plan'} Subscription`,
                qty: 1,
                unitPriceCents: Math.max(0, Math.floor(input.amountCents + discountCents - taxCents)),
                totalCents: Math.max(0, Math.floor(input.amountCents + discountCents - taxCents))
            }];

        const lineItemsSubtotal = normalizedLineItems.reduce((sum, item) => sum + item.totalCents, 0);
        const subtotalCents = Math.max(
            0,
            Math.floor(
                typeof input.subtotalCents === 'number'
                    ? input.subtotalCents
                    : (lineItemsSubtotal > 0 ? lineItemsSubtotal : input.amountCents + discountCents - taxCents)
            )
        );
        const planLabel = (input.planName || input.planType || 'ENTERPRISE').toString();
        const billingMode = resolveInvoiceBillingMode({
            planType: input.planType,
            billingGateway: input.billingGateway
        });
        const footerWording = buildInvoiceFooterWording({
            billingMode,
            status: input.status,
            dueAt: input.dueAt,
            taxCents,
            currency: input.currency,
            recipientCountryCode: input.billToCountryCode,
            notes: input.notes
        });

        let y = margin;
        const rightColumnWidth = 240;
        const rightColumnX = margin + pageWidth - rightColumnWidth;
        const headerTopY = y + 4;
        const brandContactTopY = headerTopY + 30;

        doc.font('Helvetica-Bold').fontSize(26).fillColor(brandDark).text('Veri', margin, headerTopY, {
            continued: true
        });
        doc.fillColor(brandBlue).text('Lnk');
        doc.font('Helvetica').fontSize(typeScale.label).fillColor(slate500)
            .text('support@verilnk.com', margin, brandContactTopY)
            .text('https://verilnk.com', margin, brandContactTopY + 12);

        doc.font('Helvetica-Bold').fontSize(typeScale.invoiceTitle).fillColor(slate900).text('INVOICE', rightColumnX, headerTopY, {
            width: rightColumnWidth,
            align: 'right'
        });

        const metaLabelWidth = 84;
        const metaRowHeight = 16;
        let metaY = y + headerPadding + 20;
        const drawHeaderMeta = (label: string, value: string) => {
            doc.font('Helvetica-Bold').fontSize(typeScale.label).fillColor(slate500).text(label, rightColumnX, metaY, { width: metaLabelWidth });
            doc.font('Helvetica').fontSize(typeScale.body).fillColor(slate900).text(value, rightColumnX + metaLabelWidth, metaY, {
                width: rightColumnWidth - metaLabelWidth,
                align: 'right',
                lineGap: bodyLineGap
            });
            metaY += metaRowHeight;
        };

        drawHeaderMeta('Invoice #', input.invoiceNumber);
        drawHeaderMeta('Issue Date', formatDate(input.invoiceDate));
        drawHeaderMeta('Plan', planLabel);
        drawHeaderMeta(
            'Period',
            input.periodStart || input.periodEnd
                ? `${formatDate(input.periodStart)} - ${formatDate(input.periodEnd)}`
                : 'N/A'
        );
        if (statusTheme.normalized === 'PAID' && input.paidAt) {
            drawHeaderMeta('Paid on', formatDate(input.paidAt));
        }

        const statusY = y + headerPadding + 44;
        doc.font('Helvetica-Bold')
            .fontSize(typeScale.status)
            .fillColor(statusTheme.textColor)
            .text(statusTheme.label, margin, statusY, {
                width: 160,
                lineGap: headingLineGap
            });

        const statusBottomY = statusY + typeScale.status * lineHeight.heading;
        y = Math.max(metaY, statusBottomY, y + 86);
        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).lineWidth(1.5).strokeColor(brandBlue).stroke();
        y += headerPadding;

        const billToWidth = Math.floor(pageWidth * 0.58);
        const metaGap = 20;
        const detailsX = margin + billToWidth + metaGap;
        const detailsWidth = pageWidth - billToWidth - metaGap;

        doc.font('Helvetica-Bold').fontSize(typeScale.sectionHeading).fillColor(slate600).text('Bill To', margin, y, {
            lineGap: headingLineGap
        });
        let billY = y + 18;
        doc.font('Helvetica-Bold').fontSize(typeScale.sectionHeading).fillColor(slate900).text(
            input.billTo.name || 'Organization Account',
            margin,
            billY,
            { width: billToWidth, lineGap: headingLineGap }
        );
        billY = doc.y + blockGap;

        const billLines = [
            toLineValue(input.billTo.email),
            toLineValue(input.billTo.website),
            toLineValue(input.billTo.address)
        ].filter(Boolean) as string[];
        doc.font('Helvetica').fontSize(typeScale.body).fillColor(slate700);
        for (const line of billLines) {
            doc.text(line, margin, billY, { width: billToWidth, lineGap: bodyLineGap });
            billY = doc.y + 2;
        }

        doc.font('Helvetica-Bold').fontSize(typeScale.sectionHeading).fillColor(slate600).text('Invoice Details', detailsX, y, {
            lineGap: headingLineGap
        });
        doc.font('Helvetica').fontSize(typeScale.body).fillColor(slate700).text(`Plan: ${planLabel}`, detailsX, y + 18, {
            width: detailsWidth,
            lineGap: bodyLineGap
        });
        doc.text(
            `Billing period: ${input.periodStart || input.periodEnd ? `${formatDate(input.periodStart)} - ${formatDate(input.periodEnd)}` : 'N/A'}`,
            detailsX,
            y + 34,
            { width: detailsWidth, lineGap: bodyLineGap }
        );
        if (statusTheme.normalized === 'PAID' && input.paidAt) {
            doc.text(`Paid on: ${formatDate(input.paidAt)}`, detailsX, y + 50, { width: detailsWidth, lineGap: bodyLineGap });
        }

        y = Math.max(billY, y + 60) + (blockGap * 2);

        const descWidth = Math.floor(pageWidth * 0.5);
        const qtyWidth = 48;
        const unitWidth = 96;
        const totalWidth = pageWidth - descWidth - qtyWidth - unitWidth;

        const colDescX = margin;
        const colQtyX = colDescX + descWidth;
        const colUnitX = colQtyX + qtyWidth;
        const colTotalX = colUnitX + unitWidth;

        const bottomLimit = doc.page.height - doc.page.margins.bottom;
        const drawTableHeader = () => {
            doc.rect(margin, y, pageWidth, 24).fill(slate100);
            doc.font('Helvetica-Bold').fontSize(typeScale.tableHeader).fillColor(slate700);
            doc.text('Description', colDescX + 8, y + 7, { width: descWidth - 12 });
            doc.text('Qty', colQtyX + 8, y + 7, { width: qtyWidth - 12 });
            doc.text('Unit price', colUnitX + 8, y + 7, { width: unitWidth - 12 });
            doc.text('Amount', colTotalX + 8, y + 7, { width: totalWidth - 12, align: 'right', ...amountFeatures });
            y += 24;
        };

        drawTableHeader();
        doc.font('Helvetica').fontSize(typeScale.body).fillColor(slate900);

        for (const item of normalizedLineItems) {
            const descriptionHeight = doc.heightOfString(item.description, {
                width: descWidth - 12
            });
            const rowHeight = Math.max(30, Math.ceil(descriptionHeight) + 12);
            if (y + rowHeight > bottomLimit - 140) {
                doc.addPage();
                y = margin;
                drawTableHeader();
            }
            doc.rect(margin, y, pageWidth, rowHeight).strokeColor(slate200).lineWidth(1).stroke();
            doc.font('Helvetica').fontSize(10).fillColor(slate900).text(
                item.description,
                colDescX + 8,
                y + 8,
                { width: descWidth - 12 }
            );
            doc.text(String(item.qty), colQtyX + 8, y + 8, { width: qtyWidth - 12 });
            doc.text(formatMoney(item.unitPriceCents, input.currency), colUnitX + 8, y + 8, {
                width: unitWidth - 12,
                ...amountFeatures
            });
            doc.text(formatMoney(item.totalCents, input.currency), colTotalX + 8, y + 8, {
                width: totalWidth - 12,
                align: 'right',
                ...amountFeatures
            });
            y += rowHeight;
        }

        y += blockGap * 2;

        const summaryWidth = 240;
        const summaryX = margin + pageWidth - summaryWidth;
        const summaryRows: Array<{ label: string; amount: number; isGrandTotal?: boolean }> = [{ label: 'Subtotal', amount: subtotalCents }];
        if (discountCents > 0) {
            summaryRows.push({ label: 'Discount', amount: discountCents * -1 });
        }
        if (taxCents > 0) {
            summaryRows.push({ label: 'Tax', amount: taxCents });
        }
        summaryRows.push({ label: 'Total', amount: input.amountCents, isGrandTotal: true });
        const summaryBaseRowHeight = 20;
        const summaryGrandRowHeight = 28;
        const summaryHeaderHeight = 32;
        const summaryRowsHeight = summaryRows.reduce(
            (height, row) => height + (row.isGrandTotal ? summaryGrandRowHeight : summaryBaseRowHeight),
            0
        );
        const summaryHeight = summaryHeaderHeight + summaryRowsHeight + 6;

        if (y + summaryHeight + 90 > bottomLimit) {
            doc.addPage();
            y = margin;
        }
        doc.roundedRect(summaryX, y, summaryWidth, summaryHeight, 8).strokeColor(slate200).lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(typeScale.sectionHeading).fillColor(slate700).text('Summary', summaryX + 12, y + 10, {
            lineGap: headingLineGap
        });

        let rowY = y + summaryHeaderHeight;
        for (const row of summaryRows) {
            if (row.isGrandTotal) {
                doc.moveTo(summaryX + 12, rowY - 4)
                    .lineTo(summaryX + summaryWidth - 12, rowY - 4)
                    .lineWidth(1)
                    .strokeColor(slate300)
                    .stroke();
            }

            doc.font(row.isGrandTotal ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(row.isGrandTotal ? typeScale.totalsLabel : typeScale.body)
                .fillColor(row.isGrandTotal ? slate900 : slate700)
                .text(row.label, summaryX + 12, rowY, { width: 100 });

            doc.font(row.isGrandTotal ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(row.isGrandTotal ? typeScale.grandTotal : typeScale.body)
                .fillColor(row.isGrandTotal ? slate900 : slate700)
                .text(formatMoney(row.amount, input.currency), summaryX + 12, rowY, {
                width: summaryWidth - 24,
                align: 'right',
                ...amountFeatures
            });
            rowY += row.isGrandTotal ? summaryGrandRowHeight : summaryBaseRowHeight;
        }

        y += summaryHeight + 24;
        if (y + 72 > bottomLimit) {
            doc.addPage();
            y = margin;
        }

        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).lineWidth(1).strokeColor(slate300).stroke();
        y += blockGap + 4;

        doc.font('Helvetica').fontSize(typeScale.footnote).fillColor(slate500);
        for (const line of footerWording.lines) {
            doc.text(line, margin, y, { width: pageWidth, align: 'left', lineGap: 2 });
            y = doc.y + 2;
        }
        doc.text(footerWording.versionLine, margin, y + 2, {
            width: pageWidth,
            align: 'left'
        });

        doc.end();
    });
};
