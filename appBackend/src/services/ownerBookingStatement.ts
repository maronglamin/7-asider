import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { prisma } from '../db/prisma';
import { bookingManageWhere, managedFieldWhere } from '../field/access';

export const STATEMENT_INCLUSIVE_DAYS = 30;

export type StatementRow = {
  id: string;
  startAt: string;
  fieldName: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  amount: number;
  type: string;
  unitCount: number;
  slotsLabel: string;
};

export type OwnerStatement = {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  owner: { name: string; email: string; phone: string | null };
  fields: { name: string; address: string | null; city: string | null }[];
  rows: StatementRow[];
  totals: {
    bookingCount: number;
    collectedGmd: number;
    outstandingGmd: number;
    cancelledGmd: number;
    pendingRefundGmd: number;
    byStatus: Record<string, { count: number; amount: number }>;
  };
};

type PdfImage = {
  width: number;
  height: number;
  rgb: Buffer;
};

function toDateKey(value: Date): string {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())).toISOString().slice(0, 10);
}

export function parseStatementDateKey(raw: unknown): string | null {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(+d) || toDateKey(d) !== value) return null;
  return value;
}

export function inclusiveDayCount(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function addDaysToKey(dateKey: string, days: number): string {
  const next = new Date(`${dateKey}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return toDateKey(next);
}

function rangeBounds(startKey: string, endKey: string): { start: Date; endExclusive: Date } {
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const endExclusive = new Date(`${endKey}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

function dec(value: unknown): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function displayName(user: { name?: string | null; email?: string | null } | null | undefined): string {
  return String(user?.name || '').trim() || String(user?.email || '').trim() || 'Field owner';
}

function customerLabel(user: { name?: string | null; email?: string | null } | null | undefined): string {
  return String(user?.name || '').trim() || String(user?.email || '').trim() || 'Customer';
}

function padHour(hour: number): string {
  return String(hour).padStart(2, '0');
}

function formatHourRange(startHour: number, endHourExclusive: number): string {
  const endLabel = endHourExclusive >= 24 ? '24:00' : `${padHour(endHourExclusive)}:00`;
  return `${padHour(startHour)}:00-${endLabel}`;
}

function compressHours(hours: number[]): string[] {
  const sorted = [...new Set(hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const ranges: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i += 1) {
    const hour = sorted[i]!;
    if (hour === prev + 1) {
      prev = hour;
      continue;
    }
    ranges.push(formatHourRange(start, prev + 1));
    start = hour;
    prev = hour;
  }
  ranges.push(formatHourRange(start, prev + 1));
  return ranges;
}

function formatShortDay(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatBookingSlotsLabel(
  units: { date: Date | string; hourStart: number }[] | null | undefined,
  type?: string | null,
): string {
  const list = Array.isArray(units) ? units : [];
  if (!list.length) return '';
  const byDay = new Map<string, number[]>();
  for (const unit of list) {
    const key = toDateKey(new Date(unit.date));
    const hours = byDay.get(key) || [];
    hours.push(Number(unit.hourStart));
    byDay.set(key, hours);
  }
  const days = [...byDay.keys()].sort();
  const bookingType = String(type || '').toUpperCase();
  const parts = days.map((day) => {
    const hours = byDay.get(day) || [];
    if (hours.length >= 24) {
      return days.length === 1 ? 'Full day 00:00-24:00' : `${formatShortDay(day)} full day`;
    }
    const ranges = compressHours(hours).join(', ');
    if (days.length === 1) return ranges;
    return `${formatShortDay(day)} ${ranges}`;
  });
  if (bookingType === 'MULTI_DAY' && days.length > 1 && days.every((day) => (byDay.get(day) || []).length >= 24)) {
    return `${formatShortDay(days[0]!)}-${formatShortDay(days[days.length - 1]!)} full days`;
  }
  return parts.join('; ');
}

function slotsFromRange(startAt: Date, endAt: Date): { date: Date; hourStart: number }[] {
  if (Number.isNaN(+startAt) || Number.isNaN(+endAt) || endAt <= startAt) return [];
  const units: { date: Date; hourStart: number }[] = [];
  const cursor = new Date(startAt);
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < endAt && units.length < 24 * 31) {
    units.push({
      date: new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())),
      hourStart: cursor.getUTCHours(),
    });
    cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
  }
  return units;
}

export async function loadOwnerStatement(ownerId: string, startKey: string, endKey: string): Promise<OwnerStatement> {
  if (inclusiveDayCount(startKey, endKey) !== STATEMENT_INCLUSIVE_DAYS) {
    throw new Error(`Statement range must be exactly ${STATEMENT_INCLUSIVE_DAYS} days`);
  }

  const { start, endExclusive } = rangeBounds(startKey, endKey);
  const [owner, fields, bookings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true, email: true },
    }),
    (prisma as any).fieldKyc.findMany({
      where: managedFieldWhere(ownerId),
      select: { name: true, address: true, city: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    (prisma as any).booking.findMany({
      where: {
        ...bookingManageWhere(ownerId),
        startAt: { gte: start, lt: endExclusive },
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
      take: 2000,
      include: {
        field: { select: { name: true } },
        user: { select: { name: true, email: true } },
        units: { select: { date: true, hourStart: true }, orderBy: [{ date: 'asc' }, { hourStart: 'asc' }] },
      },
    }),
  ]);

  if (!owner) throw new Error('Owner not found');

  const byStatus: Record<string, { count: number; amount: number }> = {};
  let collectedGmd = 0;
  let outstandingGmd = 0;
  let cancelledGmd = 0;
  let pendingRefundGmd = 0;

  const rows: StatementRow[] = bookings.map((b: any) => {
    const amount = dec(b.totalAmount);
    const status = String(b.status || 'PENDING').toUpperCase();
    const paymentStatus = String(b.paymentStatus || 'UNPAID').toUpperCase();
    if (!byStatus[status]) byStatus[status] = { count: 0, amount: 0 };
    byStatus[status].count += 1;
    byStatus[status].amount += amount;
    if (status === 'CANCELLED') cancelledGmd += amount;
    else if (status === 'PENDING_REFUND') pendingRefundGmd += amount;
    else if (paymentStatus === 'PAID') collectedGmd += amount;
    else outstandingGmd += amount;
    const units = Array.isArray(b.units) && b.units.length
      ? b.units
      : slotsFromRange(new Date(b.startAt), new Date(b.endAt));
    return {
      id: String(b.id),
      startAt: new Date(b.startAt).toISOString(),
      fieldName: String(b.field?.name || 'Field'),
      customerName: customerLabel(b.user),
      status,
      paymentStatus,
      amount,
      type: String(b.type || 'HOURLY'),
      unitCount: units.length,
      slotsLabel: formatBookingSlotsLabel(units, b.type),
    };
  });

  const phone = (fields as any[]).map((f) => String(f.phone || '').trim()).find(Boolean) || null;

  return {
    periodStart: startKey,
    periodEnd: endKey,
    generatedAt: new Date().toISOString(),
    owner: {
      name: displayName(owner),
      email: String(owner.email || ''),
      phone,
    },
    fields: (fields as any[]).map((f) => ({
      name: String(f.name || 'Field'),
      address: f.address ? String(f.address) : null,
      city: f.city ? String(f.city) : null,
    })),
    rows,
    totals: {
      bookingCount: rows.length,
      collectedGmd,
      outstandingGmd,
      cancelledGmd,
      pendingRefundGmd,
      byStatus,
    },
  };
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toPdfSafe(value: string) {
  return String(value || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncatePdf(value: string, maxChars: number) {
  const text = toPdfSafe(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function wrapPdf(value: string, maxChars: number, maxLines = 2): string[] {
  const text = toPdfSafe(value);
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines - 1) {
      lines.push(truncatePdf(words.slice(i).join(' '), maxChars));
      return lines;
    }
    current = word.length > maxChars ? truncatePdf(word, maxChars) : word;
  }
  if (current) lines.push(truncatePdf(current, maxChars));
  return lines.slice(0, maxLines);
}

function formatGmd(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `GMD ${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatStatus(value: string) {
  return toPdfSafe(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLongDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRowDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function unfilterPngScanlines(inflated: Buffer, width: number, height: number, bytesPerPixel: number) {
  const rowLength = width * bytesPerPixel;
  const output = Buffer.alloc(rowLength * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? output[rowOffset - rowLength + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? output[rowOffset - rowLength + x - bytesPerPixel] : 0;
      let value = raw;
      if (filterType === 1) value = raw + left;
      else if (filterType === 2) value = raw + up;
      else if (filterType === 3) value = raw + Math.floor((left + up) / 2);
      else if (filterType === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = raw + predictor;
      } else if (filterType !== 0) {
        throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      output[rowOffset + x] = value & 0xff;
    }
    inputOffset += rowLength;
  }
  return output;
}

function readPngForPdf(filePath: string): PdfImage | null {
  try {
    const png = fs.readFileSync(filePath);
    if (png.toString('ascii', 1, 4) !== 'PNG') return null;
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idatChunks: Buffer[] = [];
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.toString('ascii', offset + 4, offset + 8);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const data = png.subarray(dataStart, dataEnd);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        interlace = data[12];
      } else if (type === 'IDAT') idatChunks.push(data);
      else if (type === 'IEND') break;
      offset = dataEnd + 4;
    }
    if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
    const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
    if (!bytesPerPixel) return null;
    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
    const pixels = unfilterPngScanlines(inflated, width, height, bytesPerPixel);
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0, o = 0; i < pixels.length; i += bytesPerPixel, o += 3) {
      if (colorType === 6) {
        const alpha = pixels[i + 3] / 255;
        rgb[o] = Math.round(pixels[i] * alpha + 255 * (1 - alpha));
        rgb[o + 1] = Math.round(pixels[i + 1] * alpha + 255 * (1 - alpha));
        rgb[o + 2] = Math.round(pixels[i + 2] * alpha + 255 * (1 - alpha));
      } else if (colorType === 2) {
        rgb[o] = pixels[i];
        rgb[o + 1] = pixels[i + 1];
        rgb[o + 2] = pixels[i + 2];
      } else if (colorType === 4) {
        const alpha = pixels[i + 1] / 255;
        const value = Math.round(pixels[i] * alpha + 255 * (1 - alpha));
        rgb[o] = value;
        rgb[o + 1] = value;
        rgb[o + 2] = value;
      } else {
        rgb[o] = pixels[i];
        rgb[o + 1] = pixels[i];
        rgb[o + 2] = pixels[i];
      }
    }
    return { width, height, rgb };
  } catch {
    return null;
  }
}

function getLogoForPdf(): PdfImage | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'appFrontend', 'public', 'icon.png'),
    path.resolve(__dirname, '..', '..', '..', 'appFrontend', 'assets', 'icon.png'),
  ];
  for (const filePath of candidates) {
    const logo = readPngForPdf(filePath);
    if (logo) return logo;
  }
  return null;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 42;
const MARGIN_BOTTOM = 52;
const TABLE_RIGHT = PAGE_W - MARGIN_X;
const COLS = [
  { key: 'date', x: 42, width: 78, max: 12, align: 'left' as const },
  { key: 'field', x: 120, width: 118, max: 20, align: 'left' as const },
  { key: 'customer', x: 238, width: 112, max: 18, align: 'left' as const },
  { key: 'status', x: 350, width: 78, max: 14, align: 'left' as const },
  { key: 'payment', x: 428, width: 58, max: 10, align: 'left' as const },
  { key: 'amount', x: 486, width: 67, max: 14, align: 'right' as const },
];

function addText(commands: string[], text: string, x: number, y: number, size = 10, color = '0.09 0.11 0.16') {
  commands.push(`BT /F1 ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(toPdfSafe(text))}) Tj ET`);
}

function addRightText(commands: string[], text: string, right: number, y: number, size = 10, color = '0.09 0.11 0.16') {
  const safe = toPdfSafe(text);
  const width = safe.length * size * 0.5;
  addText(commands, safe, right - width, y, size, color);
}

function addHLine(commands: string[], y: number, color = '0.88 0.90 0.93', width = 0.6) {
  commands.push(`q ${color} RG ${width} w ${MARGIN_X} ${y.toFixed(2)} m ${TABLE_RIGHT} ${y.toFixed(2)} l S Q`);
}

function buildPageContent(opts: {
  statement: OwnerStatement;
  rows: StatementRow[];
  pageIndex: number;
  pageCount: number;
  isFirst: boolean;
  hasLogo: boolean;
}): string {
  const { statement, rows, pageIndex, pageCount, isFirst, hasLogo } = opts;
  const commands: string[] = [];
  const brand = '0.09 0.64 0.29';
  const muted = '0.42 0.45 0.50';
  const ink = '0.09 0.11 0.16';

  if (isFirst) {
    if (hasLogo) commands.push('q 36 0 0 36 42 766 cm /Logo Do Q');
    addText(commands, '7a-side', hasLogo ? 86 : 42, 788, 16, brand);
    addText(commands, 'Football field booking', hasLogo ? 86 : 42, 774, 8, muted);
    addText(commands, 'BOOKING STATEMENT', hasLogo ? 86 : 42, 760, 8, brand);

    addRightText(commands, statement.owner.name, TABLE_RIGHT, 788, 11, ink);
    addRightText(commands, statement.owner.email, TABLE_RIGHT, 774, 8, muted);
    if (statement.owner.phone) addRightText(commands, statement.owner.phone, TABLE_RIGHT, 762, 8, muted);
    const fieldLine = statement.fields.length
      ? statement.fields.map((f) => f.name).slice(0, 3).join(', ') + (statement.fields.length > 3 ? '...' : '')
      : 'All fields';
    addRightText(commands, fieldLine, TABLE_RIGHT, 748, 8, muted);

    addHLine(commands, 736, '0.09 0.64 0.29', 1.2);

    addText(commands, `Period  ${formatLongDate(statement.periodStart)}  –  ${formatLongDate(statement.periodEnd)}`, MARGIN_X, 718, 10, ink);
    addRightText(
      commands,
      `Generated ${new Date(statement.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      TABLE_RIGHT,
      718,
      8,
      muted,
    );
    addText(commands, 'All booking statuses in this 30-day range are included.', MARGIN_X, 704, 8, muted);

    const cards = [
      { label: 'Bookings', value: String(statement.totals.bookingCount) },
      { label: 'Collected', value: formatGmd(statement.totals.collectedGmd) },
      { label: 'Outstanding', value: formatGmd(statement.totals.outstandingGmd) },
      { label: 'Cancelled', value: formatGmd(statement.totals.cancelledGmd + statement.totals.pendingRefundGmd) },
    ];
    const cardW = (TABLE_RIGHT - MARGIN_X - 18) / 4;
    cards.forEach((card, i) => {
      const x = MARGIN_X + i * (cardW + 6);
      commands.push(`q 0.97 0.98 0.98 rg ${x.toFixed(2)} 650 ${cardW.toFixed(2)} 42 re f Q`);
      addText(commands, card.label.toUpperCase(), x + 8, 678, 7, muted);
      addText(commands, truncatePdf(card.value, 16), x + 8, 662, 9, ink);
    });
  } else {
    addText(commands, '7a-side', MARGIN_X, 800, 11, brand);
    addText(commands, 'Booking statement (continued)', MARGIN_X, 786, 8, muted);
    addRightText(commands, statement.owner.name, TABLE_RIGHT, 800, 9, ink);
    addRightText(commands, `${formatLongDate(statement.periodStart)} – ${formatLongDate(statement.periodEnd)}`, TABLE_RIGHT, 786, 8, muted);
    addHLine(commands, 776, '0.09 0.64 0.29', 1);
  }

  let y = isFirst ? 632 : 758;
  addHLine(commands, y + 14, '0.09 0.11 0.16', 0.8);
  addText(commands, 'Date', COLS[0]!.x, y, 8, muted);
  addText(commands, 'Field', COLS[1]!.x, y, 8, muted);
  addText(commands, 'Customer', COLS[2]!.x, y, 8, muted);
  addText(commands, 'Status', COLS[3]!.x, y, 8, muted);
  addText(commands, 'Payment', COLS[4]!.x, y, 8, muted);
  addRightText(commands, 'Amount', TABLE_RIGHT, y, 8, muted);
  y -= 6;
  addHLine(commands, y, '0.09 0.11 0.16', 0.8);
  y -= 16;

  if (!rows.length && isFirst) {
    addText(commands, 'No bookings in this period.', MARGIN_X, y, 10, muted);
  }

  for (const row of rows) {
    addText(commands, formatRowDate(row.startAt), COLS[0]!.x, y, 8, ink);
    addText(commands, truncatePdf(row.fieldName, COLS[1]!.max), COLS[1]!.x, y, 8, ink);
    addText(commands, truncatePdf(row.customerName, COLS[2]!.max), COLS[2]!.x, y, 8, ink);
    addText(commands, truncatePdf(formatStatus(row.status), COLS[3]!.max), COLS[3]!.x, y, 8, ink);
    addText(commands, truncatePdf(formatStatus(row.paymentStatus), COLS[4]!.max), COLS[4]!.x, y, 8, ink);
    addRightText(commands, formatGmd(row.amount), TABLE_RIGHT, y, 8, ink);
    const slotLines = wrapPdf(
      row.slotsLabel ? `Slots  ${row.slotsLabel}${row.unitCount ? `  (${row.unitCount}h)` : ''}` : '',
      92,
      2,
    );
    if (slotLines.length) {
      y -= 11;
      slotLines.forEach((line, index) => {
        addText(commands, line, COLS[0]!.x, y, 7, muted);
        if (index < slotLines.length - 1) y -= 10;
      });
    }
    y -= 8;
    addHLine(commands, y, '0.91 0.92 0.94', 0.4);
    y -= 14;
  }

  if (pageIndex === pageCount - 1 && statement.rows.length) {
    y -= 6;
    addHLine(commands, y + 16, '0.09 0.11 0.16', 0.8);
    addText(commands, 'Totals', COLS[0].x, y, 9, ink);
    addRightText(commands, formatGmd(statement.rows.reduce((sum, r) => sum + r.amount, 0)), TABLE_RIGHT, y, 9, ink);
    y -= 16;
    addText(commands, `Collected ${formatGmd(statement.totals.collectedGmd)}   Outstanding ${formatGmd(statement.totals.outstandingGmd)}`, MARGIN_X, y, 8, muted);
  }

  addHLine(commands, 40, '0.88 0.90 0.93', 0.5);
  addText(commands, '7a-side  ·  Confidential field-owner statement', MARGIN_X, 28, 7, muted);
  addRightText(commands, `Page ${pageIndex + 1} of ${pageCount}`, TABLE_RIGHT, 28, 7, muted);

  return commands.join('\n');
}

export function statementPdfFilename(statement: OwnerStatement) {
  return `7a-side-booking-statement-${statement.periodStart}-to-${statement.periodEnd}.pdf`;
}

export function buildOwnerStatementPdf(statement: OwnerStatement): Buffer {
  const logo = getLogoForPdf();
  const compressedLogo = logo ? zlib.deflateSync(logo.rgb) : null;
  const firstHeaderRows = 12;
  const contHeaderRows = 16;
  const chunks: StatementRow[][] = [];
  if (!statement.rows.length) {
    chunks.push([]);
  } else {
    let remaining = [...statement.rows];
    chunks.push(remaining.splice(0, firstHeaderRows));
    while (remaining.length) chunks.push(remaining.splice(0, contHeaderRows));
  }

  const pageStreams = chunks.map((rows, pageIndex) =>
    buildPageContent({
      statement,
      rows,
      pageIndex,
      pageCount: chunks.length,
      isFirst: pageIndex === 0,
      hasLogo: Boolean(logo),
    }),
  );

  const objects: Buffer[] = [];
  const pageCount = pageStreams.length;
  const fontObjNum = 3;
  const logoObjNum = logo ? 4 : 0;
  const firstPageObjNum = logo ? 5 : 4;

  const pageObjectNums = pageStreams.map((_, i) => firstPageObjNum + i * 2);
  const kids = pageObjectNums.map((n) => `${n} 0 R`).join(' ');
  const resources = logo
    ? `<< /Font << /F1 ${fontObjNum} 0 R >> /XObject << /Logo ${logoObjNum} 0 R >> >>`
    : `<< /Font << /F1 ${fontObjNum} 0 R >> >>`;

  objects.push(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1'));
  objects.push(Buffer.from(`2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [ ${kids} ] >>\nendobj\n`, 'latin1'));
  objects.push(Buffer.from('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'latin1'));
  if (logo && compressedLogo) {
    objects.push(Buffer.concat([
      Buffer.from(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedLogo.length} >>\nstream\n`,
        'latin1',
      ),
      compressedLogo,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]));
  }

  pageStreams.forEach((content, i) => {
    const pageObj = pageObjectNums[i];
    const contentObj = pageObj + 1;
    const stream = Buffer.from(content, 'latin1');
    objects.push(Buffer.from(
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R /Resources ${resources} >>\nendobj\n`,
      'latin1',
    ));
    objects.push(Buffer.concat([
      Buffer.from(`${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
      stream,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]));
  });

  const pdfParts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.concat(pdfParts).length);
    pdfParts.push(object);
  }
  const xrefOffset = Buffer.concat(pdfParts).length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  pdfParts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(pdfParts);
}
