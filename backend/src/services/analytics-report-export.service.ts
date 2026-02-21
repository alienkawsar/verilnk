type AnalyticsReportRow = {
    date: string;
    views: number;
    clicks: number;
    ctr: number;
};

type BuildAnalyticsReportPdfInput = {
    entityName: string;
    rangeLabel: string;
    generatedAt: Date;
    totalViews: number;
    totalClicks: number;
    totalCtr: number;
    rows: AnalyticsReportRow[];
};

const FALLBACK_NAME = 'entity';

export const formatLocalDateYYYYMMDD = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const sanitizeEntityNameForFilename = (value: string | null | undefined): string => {
    if (!value) return '';
    return value
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
};

const normalizeRangeLabelForFilename = (rangeLabel: string | null | undefined): string => {
    const raw = String(rangeLabel || '').trim().toLowerCase();
    if (!raw) return '30d';
    if (/^\d+d$/.test(raw)) return raw;
    if (/^\d+$/.test(raw)) return `${raw}d`;

    const lastDaysMatch = raw.match(/^last[\s_-]+(\d+)[\s_-]+days?$/);
    if (lastDaysMatch?.[1]) {
        return `${lastDaysMatch[1]}d`;
    }

    const customRangeMatch = raw.match(/^custom[-_]?(\d{4}-?\d{2}-?\d{2})[-_](\d{4}-?\d{2}-?\d{2})$/);
    if (customRangeMatch) {
        const start = customRangeMatch[1].replace(/-/g, '');
        const end = customRangeMatch[2].replace(/-/g, '');
        return `custom-${start}-${end}`;
    }

    const sanitized = raw
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return sanitized || 'custom';
};

export const buildAnalyticsReportFilename = (
    entityName: string | null | undefined,
    fallbackPrefix: string,
    fallbackId: string,
    extension: 'pdf' | 'csv',
    generatedAt: Date = new Date(),
    rangeLabel?: string
): string => {
    const dateStamp = formatLocalDateYYYYMMDD(generatedAt);
    const rangeToken = normalizeRangeLabelForFilename(rangeLabel);
    const safeEntityName = sanitizeEntityNameForFilename(entityName);
    const safeFallbackPrefix = sanitizeEntityNameForFilename(fallbackPrefix) || FALLBACK_NAME;
    const safeFallbackId = sanitizeEntityNameForFilename(fallbackId)?.slice(0, 12)
        || String(fallbackId || '').slice(0, 12)
        || 'unknown';
    const baseName = safeEntityName || `${safeFallbackPrefix}_${safeFallbackId}`;
    return `${baseName}_Analytics_${rangeToken}_${dateStamp}.${extension}`;
};

export const buildAnalyticsReportCsv = (rows: AnalyticsReportRow[]): string => {
    const header = 'date,views,clicks,ctr';
    const body = rows.map((row) => {
        const safeDate = String(row.date || '').trim();
        const views = Number.isFinite(row.views) ? Math.max(0, Math.floor(row.views)) : 0;
        const clicks = Number.isFinite(row.clicks) ? Math.max(0, Math.floor(row.clicks)) : 0;
        const ctr = Number.isFinite(row.ctr) ? row.ctr : 0;
        return `${safeDate},${views},${clicks},${ctr.toFixed(2)}`;
    });
    return [header, ...body].join('\n');
};

const formatNumber = (value: number): string => {
    return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '0';
};

const formatPercent = (value: number): string => {
    return `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;
};

const formatLocalTimestamp = (date: Date): string => {
    const datePart = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
    const timePart = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(date);
    const timezoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')
        ?.value || 'Local';
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteMinutes = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
    const offsetRemainder = String(absoluteMinutes % 60).padStart(2, '0');
    const offset = `GMT${sign}${offsetHours}:${offsetRemainder}`;

    return `${datePart} ${timePart} (${timezoneName}, ${offset})`;
};

export const buildAnalyticsReportPdfBuffer = async (input: BuildAnalyticsReportPdfInput): Promise<Buffer> => {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        const title = `${input.entityName} — Analytics Report`;
        const generatedDate = formatLocalDateYYYYMMDD(input.generatedAt);
        const generatedTimestamp = formatLocalTimestamp(input.generatedAt);
        const summary = [
            { label: 'Total Views', value: formatNumber(input.totalViews) },
            { label: 'Total Clicks', value: formatNumber(input.totalClicks) },
            { label: 'CTR', value: formatPercent(input.totalCtr) }
        ];

        let y = 0;

        const resolvePageLayout = () => {
            const frameX = doc.page.margins.left;
            const frameY = doc.page.margins.top;
            const frameWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            const frameHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
            const contentInset = 14;
            const contentLeft = frameX + contentInset;
            const contentTop = frameY + contentInset;
            const contentWidth = frameWidth - contentInset * 2;
            const contentBottom = frameY + frameHeight - contentInset;

            return {
                frameX,
                frameY,
                frameWidth,
                frameHeight,
                contentLeft,
                contentTop,
                contentWidth,
                contentBottom
            };
        };

        let layout = resolvePageLayout();

        const drawPageFrame = () => {
            doc.save();
            doc.roundedRect(layout.frameX, layout.frameY, layout.frameWidth, layout.frameHeight, 8)
                .lineWidth(1)
                .strokeColor('#dbe3ee')
                .stroke();
            doc.restore();
        };

        const resetPage = () => {
            layout = resolvePageLayout();
            drawPageFrame();
            y = layout.contentTop;
        };

        const drawReportHeader = () => {
            doc.font('Helvetica-Bold').fontSize(16);
            const brandLeft = 'Veri';
            const brandRight = 'Lnk';
            const brandWidth = doc.widthOfString(`${brandLeft}${brandRight}`);
            const brandStartX = layout.contentLeft + Math.max(0, (layout.contentWidth - brandWidth) / 2);

            doc.fillColor('#101627').text(brandLeft, brandStartX, y, { lineBreak: false });
            doc.fillColor('#187DE9').text(brandRight, brandStartX + doc.widthOfString(brandLeft), y);
            y += 24;

            doc.font('Helvetica-Bold').fontSize(18).fillColor('#101627');
            const titleHeight = doc.heightOfString(title, { width: layout.contentWidth, align: 'center' });
            doc.text(title, layout.contentLeft, y, { width: layout.contentWidth, align: 'center' });
            y += titleHeight + 6;

            const rangeLine = `Range: ${input.rangeLabel}  •  Generated: ${generatedDate}`;
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            const rangeHeight = doc.heightOfString(rangeLine, { width: layout.contentWidth, align: 'center' });
            doc.text(rangeLine, layout.contentLeft, y, { width: layout.contentWidth, align: 'center' });
            y += rangeHeight + 4;

            const timestampLine = `Timestamp: ${generatedTimestamp}`;
            doc.font('Helvetica').fontSize(9).fillColor('#64748b');
            const timestampHeight = doc.heightOfString(timestampLine, { width: layout.contentWidth, align: 'center' });
            doc.text(timestampLine, layout.contentLeft, y, { width: layout.contentWidth, align: 'center' });
            y += timestampHeight + 12;

            doc.moveTo(layout.contentLeft, y)
                .lineTo(layout.contentLeft + layout.contentWidth, y)
                .lineWidth(1.2)
                .strokeColor('#cbd5e1')
                .stroke();
            y += 14;
        };

        const drawSummaryCards = () => {
            const cardGap = 10;
            const cardWidth = (layout.contentWidth - cardGap * (summary.length - 1)) / summary.length;
            const cardHeight = 58;

            summary.forEach((item, index) => {
                const cardX = layout.contentLeft + index * (cardWidth + cardGap);
                doc.roundedRect(cardX, y, cardWidth, cardHeight, 8).lineWidth(1).strokeColor('#e2e8f0').stroke();
                doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(item.label, cardX + 10, y + 11);
                doc.font('Helvetica-Bold').fontSize(16).fillColor('#101627').text(item.value, cardX + 10, y + 27, {
                    width: cardWidth - 20
                });
            });

            y += cardHeight + 16;
        };

        const tableColumnGap = 10;
        const dateColumnWidth = Math.max(130, Math.floor(layout.contentWidth * 0.42));
        const viewsColumnWidth = Math.max(62, Math.floor((layout.contentWidth - dateColumnWidth - tableColumnGap * 3) / 3));
        const clicksColumnWidth = viewsColumnWidth;
        const ctrColumnWidth = layout.contentWidth
            - dateColumnWidth
            - viewsColumnWidth
            - clicksColumnWidth
            - tableColumnGap * 3;
        const colDate = layout.contentLeft;
        const colViews = colDate + dateColumnWidth + tableColumnGap;
        const colClicks = colViews + viewsColumnWidth + tableColumnGap;
        const colCtr = colClicks + clicksColumnWidth + tableColumnGap;
        const rowHeight = 24;
        const headerHeight = 24;
        const getTableBottomLimit = () => layout.contentBottom - 28;

        const drawTableTitle = (continued: boolean) => {
            doc.font('Helvetica-Bold')
                .fontSize(12)
                .fillColor('#101627')
                .text(continued ? 'Daily Performance (continued)' : 'Daily Performance', layout.contentLeft, y, {
                    width: layout.contentWidth
                });
            y += 16;
        };

        const drawTableHeader = () => {
            doc.rect(layout.contentLeft, y, layout.contentWidth, headerHeight).fill('#f8fafc');
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155');
            doc.text('Date', colDate + 8, y + 7, { width: dateColumnWidth - 8 });
            doc.text('Views', colViews, y + 7, { width: viewsColumnWidth, align: 'right' });
            doc.text('Clicks', colClicks, y + 7, { width: clicksColumnWidth, align: 'right' });
            doc.text('CTR', colCtr, y + 7, { width: ctrColumnWidth, align: 'right' });
            y += headerHeight;
        };

        resetPage();
        drawReportHeader();
        drawSummaryCards();
        drawTableTitle(false);
        drawTableHeader();

        doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
        for (const row of input.rows) {
            if (y + rowHeight > getTableBottomLimit()) {
                doc.addPage();
                resetPage();
                drawReportHeader();
                drawTableTitle(true);
                drawTableHeader();
                doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
            }

            doc.rect(layout.contentLeft, y, layout.contentWidth, rowHeight).lineWidth(1).strokeColor('#e2e8f0').stroke();
            doc.text(row.date, colDate + 8, y + 7, { width: dateColumnWidth - 8 });
            doc.text(formatNumber(row.views), colViews, y + 7, { width: viewsColumnWidth, align: 'right' });
            doc.text(formatNumber(row.clicks), colClicks, y + 7, { width: clicksColumnWidth, align: 'right' });
            doc.text(formatPercent(row.ctr), colCtr, y + 7, { width: ctrColumnWidth, align: 'right' });
            y += rowHeight;
        }

        const pageRange = doc.bufferedPageRange();
        for (let page = 0; page < pageRange.count; page += 1) {
            doc.switchToPage(page);
            const pageLayout = resolvePageLayout();
            const footerY = pageLayout.frameY + pageLayout.frameHeight - 18;
            doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(
                'Generated by VeriLnk Analytics',
                pageLayout.contentLeft,
                footerY,
                { width: pageLayout.contentWidth / 2, align: 'left' }
            );
            doc.text(
                `Page ${page + 1} of ${pageRange.count}`,
                pageLayout.contentLeft + pageLayout.contentWidth / 2,
                footerY,
                { width: pageLayout.contentWidth / 2, align: 'right' }
            );
        }

        doc.end();
    });
};
