import type { PlanType } from '@prisma/client';

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
    paidAt?: Date | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    planName?: string | null;
    planType?: PlanType | string | null;
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
};

type NormalizedInvoiceStatus = 'PAID' | 'OPEN' | 'DRAFT' | 'VOID' | 'REFUNDED';

type InvoiceStatusTheme = {
    normalized: NormalizedInvoiceStatus;
    label: 'PAID' | 'DUE' | 'DRAFT' | 'VOID' | 'REFUNDED';
    textColor: string;
    backgroundColor: string;
    borderColor: string;
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
            textColor: '#0F9D58',
            backgroundColor: '#E9F7EF',
            borderColor: '#0F9D58'
        };
    }

    if (normalized === 'OPEN') {
        return {
            normalized: 'OPEN',
            label: 'DUE',
            textColor: '#B45309',
            backgroundColor: '#FEF3C7',
            borderColor: '#B45309'
        };
    }

    if (normalized === 'VOID') {
        return {
            normalized: 'VOID',
            label: 'VOID',
            textColor: '#8B1E1E',
            backgroundColor: '#FDECEC',
            borderColor: '#8B1E1E'
        };
    }

    if (normalized === 'REFUNDED') {
        return {
            normalized: 'REFUNDED',
            label: 'REFUNDED',
            textColor: '#1E40AF',
            backgroundColor: '#E0E7FF',
            borderColor: '#1E40AF'
        };
    }

    return {
        normalized: 'DRAFT',
        label: 'DRAFT',
        textColor: '#374151',
        backgroundColor: '#F3F4F6',
        borderColor: '#374151'
    };
};

export const buildInvoicePdfBuffer = async (input: InvoicePdfInput): Promise<Buffer> => {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 48 });
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

        let y = margin;
        const rightColumnWidth = 240;
        const rightColumnX = margin + pageWidth - rightColumnWidth;

        doc.font('Helvetica-Bold').fontSize(26).fillColor(brandDark).text('Veri', margin, y, {
            continued: true
        });
        doc.fillColor(brandBlue).text('Lnk');
        doc.font('Helvetica').fontSize(9).fillColor(slate500)
            .text('support@verilnk.com', margin, y + 30)
            .text('https://verilnk.com', margin, y + 42);

        doc.font('Helvetica-Bold').fontSize(24).fillColor(slate900).text('INVOICE', rightColumnX, y, {
            width: rightColumnWidth,
            align: 'right'
        });

        const metaLabelWidth = 80;
        let metaY = y + 34;
        const drawHeaderMeta = (label: string, value: string) => {
            doc.font('Helvetica').fontSize(9).fillColor(slate500).text(label, rightColumnX, metaY, { width: metaLabelWidth });
            doc.font('Helvetica-Bold').fontSize(9).fillColor(slate900).text(value, rightColumnX + metaLabelWidth, metaY, {
                width: rightColumnWidth - metaLabelWidth,
                align: 'right'
            });
            metaY += 14;
        };

        drawHeaderMeta('Invoice #', input.invoiceNumber);
        drawHeaderMeta('Date', formatDate(input.invoiceDate));

        const badgePaddingX = 10;
        const badgePaddingY = 4;
        doc.font('Helvetica-Bold').fontSize(9);
        const badgeTextWidth = doc.widthOfString(statusTheme.label);
        const badgeWidth = badgeTextWidth + badgePaddingX * 2;
        const badgeHeight = 18;
        const badgeX = rightColumnX + rightColumnWidth - badgeWidth;
        const badgeY = metaY + 2;
        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 6)
            .fillAndStroke(statusTheme.backgroundColor, statusTheme.borderColor);
        doc.fillColor(statusTheme.textColor).text(statusTheme.label, badgeX, badgeY + badgePaddingY, {
            width: badgeWidth,
            align: 'center'
        });
        metaY = badgeY + badgeHeight + 6;
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

        y = Math.max(metaY, y + 86);
        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).lineWidth(1.5).strokeColor(brandBlue).stroke();
        y += 18;

        const billToWidth = Math.floor(pageWidth * 0.58);
        const metaGap = 20;
        const detailsX = margin + billToWidth + metaGap;
        const detailsWidth = pageWidth - billToWidth - metaGap;

        doc.font('Helvetica-Bold').fontSize(10).fillColor(slate600).text('Bill To', margin, y);
        let billY = y + 16;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(slate900).text(
            input.billTo.name || 'Organization Account',
            margin,
            billY,
            { width: billToWidth }
        );
        billY = doc.y + 2;

        const billLines = [
            toLineValue(input.billTo.email),
            toLineValue(input.billTo.website),
            toLineValue(input.billTo.address)
        ].filter(Boolean) as string[];
        doc.font('Helvetica').fontSize(10).fillColor(slate700);
        for (const line of billLines) {
            doc.text(line, margin, billY, { width: billToWidth });
            billY = doc.y + 1;
        }

        doc.font('Helvetica-Bold').fontSize(10).fillColor(slate600).text('Invoice Details', detailsX, y);
        doc.font('Helvetica').fontSize(10).fillColor(slate700).text(`Plan: ${planLabel}`, detailsX, y + 16, { width: detailsWidth });
        doc.text(
            `Billing period: ${input.periodStart || input.periodEnd ? `${formatDate(input.periodStart)} - ${formatDate(input.periodEnd)}` : 'N/A'}`,
            detailsX,
            y + 30,
            { width: detailsWidth }
        );
        if (statusTheme.normalized === 'PAID' && input.paidAt) {
            doc.text(`Paid on: ${formatDate(input.paidAt)}`, detailsX, y + 44, { width: detailsWidth });
        }

        y = Math.max(billY, y + 56) + 18;

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
            doc.font('Helvetica-Bold').fontSize(9).fillColor(slate700);
            doc.text('Description', colDescX + 8, y + 7, { width: descWidth - 12 });
            doc.text('Qty', colQtyX + 8, y + 7, { width: qtyWidth - 12 });
            doc.text('Unit price', colUnitX + 8, y + 7, { width: unitWidth - 12 });
            doc.text('Amount', colTotalX + 8, y + 7, { width: totalWidth - 12, align: 'right' });
            y += 24;
        };

        drawTableHeader();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(slate700);

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
                width: unitWidth - 12
            });
            doc.text(formatMoney(item.totalCents, input.currency), colTotalX + 8, y + 8, {
                width: totalWidth - 12,
                align: 'right'
            });
            y += rowHeight;
        }

        y += 18;

        const summaryWidth = 240;
        const summaryX = margin + pageWidth - summaryWidth;
        const summaryRows: Array<{ label: string; amount: number; strong?: boolean }> = [{ label: 'Subtotal', amount: subtotalCents }];
        if (discountCents > 0) {
            summaryRows.push({ label: 'Discount', amount: discountCents * -1 });
        }
        if (taxCents > 0) {
            summaryRows.push({ label: 'Tax', amount: taxCents });
        }
        summaryRows.push({ label: 'Total', amount: input.amountCents, strong: true });
        const summaryHeight = 28 + summaryRows.length * 18;

        if (y + summaryHeight + 90 > bottomLimit) {
            doc.addPage();
            y = margin;
        }
        doc.roundedRect(summaryX, y, summaryWidth, summaryHeight, 8).strokeColor(slate200).lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor(slate700).text('Summary', summaryX + 12, y + 10);

        let rowY = y + 30;
        for (const row of summaryRows) {
            doc.font(row.strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.strong ? 10.5 : 9.5).fillColor(row.strong ? slate900 : slate700)
                .text(row.label, summaryX + 12, rowY, { width: 100 });
            doc.text(formatMoney(row.amount, input.currency), summaryX + 12, rowY, {
                width: summaryWidth - 24,
                align: 'right'
            });
            rowY += 18;
        }

        y += summaryHeight + 24;
        if (y + 72 > bottomLimit) {
            doc.addPage();
            y = margin;
        }

        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).lineWidth(1).strokeColor(slate300).stroke();
        y += 12;

        doc.font('Helvetica').fontSize(9).fillColor(slate500).text(
            input.notes
                || 'Thank you for your business. Payment terms: Due on receipt.\nFor billing assistance, contact support@verilnk.com.',
            margin,
            y,
            { width: pageWidth }
        );
        y = doc.y + 8;
        doc.font('Helvetica').fontSize(8.5).fillColor(slate500).text(
            'This invoice is system-generated and valid without a signature.',
            margin,
            y,
            { width: pageWidth }
        );

        doc.end();
    });
};
