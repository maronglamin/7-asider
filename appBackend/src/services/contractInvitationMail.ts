import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || '7-aside';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const CONTRACT_INVITATION_PROPOSAL_FILENAME = '7a-side-field-partnership-request.pdf';

export type ContractInvitationTemplateType = 'DEFAULT' | 'CUSTOM';

export type ContractInvitationTemplate = {
  subject: string;
  messageText: string;
  messageHtml: string;
};

type SendContractInvitationParams = ContractInvitationTemplate & {
  to: string;
  cc?: string[];
  businessName?: string | null;
  platformFeePerHour?: number | null;
};

type ContractInvitationVariables = {
  businessName?: string | null;
  platformFeePerHour?: number | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function textToHtml(messageText: string) {
  return messageText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function getSafeBusinessName(businessName?: string | null) {
  return businessName?.trim() || 'your field';
}

function getSafePlatformFee(platformFeePerHour?: number | null) {
  const fee = Number(platformFeePerHour);
  return Number.isFinite(fee) && fee > 0 ? fee : 100;
}

function formatGmd(value: number) {
  return `GMD${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function getDefaultContractInvitationTemplate(
  recipientName?: string | null,
  variables: ContractInvitationVariables = {}
): ContractInvitationTemplate {
  const safeName = recipientName?.trim() || 'there';
  const businessName = getSafeBusinessName(variables.businessName);
  const platformFee = formatGmd(getSafePlatformFee(variables.platformFeePerHour));
  const subject = '7a-side Business Partnership Request';
  const messageText = [
    `Hello ${safeName},`,
    '',
    `We are pleased to invite ${businessName} to consider a business partnership with 7a-side.`,
    '',
    '7a-side is a football field booking platform built to help players discover available fields, make bookings, and complete payments more easily. For field owners, the platform is designed to improve booking visibility, reduce manual coordination, and support a more organized booking process.',
    '',
    `Under this partnership, for every booking hour completed through 7a-side, 7a-side earns ${platformFee}. ${businessName} keeps the remaining booking revenue according to the hourly price listed for the field.`,
    '',
    'To support smooth payment collection and settlement, the field must maintain a merchant account with at least one supported local wallet provider: APS, Wave, or Yonna.',
    '',
    'Please review the attached partnership request document and reply to this email with any questions or the next steps for onboarding your field.',
    '',
    'Regards,',
    'The 7a-side Team',
  ].join('\n');

  return {
    subject,
    messageText,
    messageHtml: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">7a-side Business Partnership Request</h2>
        ${textToHtml(messageText)}
      </div>
    `,
  };
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfText(value: string, maxChars = 88) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type PdfImage = {
  width: number;
  height: number;
  rgb: Buffer;
};

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

      if (filterType === 1) {
        value = raw + left;
      } else if (filterType === 2) {
        value = raw + up;
      } else if (filterType === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filterType === 4) {
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
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      } else if (type === 'IEND') {
        break;
      }

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

function getLogoForPdf() {
  const logoPath = path.resolve(__dirname, '..', '..', '..', 'appFrontend', 'public', 'icon.png');
  return readPngForPdf(logoPath);
}

function buildPdfTextStream(hasLogo: boolean, variables: ContractInvitationVariables) {
  const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const businessName = getSafeBusinessName(variables.businessName);
  const platformFee = formatGmd(getSafePlatformFee(variables.platformFeePerHour));
  const commands: string[] = [];
  const addText = (text: string, x: number, y: number, size = 10, color = '0.07 0.10 0.16') => {
    commands.push(`BT /F1 ${size} Tf ${color} rg ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
  };
  const addWrapped = (text: string, x: number, y: number, size = 10, maxChars = 92, lineHeight = 13, color = '0.07 0.10 0.16') => {
    let nextY = y;
    for (const line of wrapPdfText(text, maxChars)) {
      addText(line, x, nextY, size, color);
      nextY -= lineHeight;
    }
    return nextY;
  };
  const addRect = (x: number, y: number, width: number, height: number, color: string) => {
    commands.push(`q ${color} rg ${x} ${y} ${width} ${height} re f Q`);
  };
  const addLine = (x1: number, y1: number, x2: number, y2: number, color = '0.88 0.91 0.94') => {
    commands.push(`q ${color} RG 1 w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  };

  if (hasLogo) {
    commands.push('q 48 0 0 48 48 754 cm /Logo Do Q');
  }
  addText('FIELD PARTNERSHIP PROPOSAL', 48, 725, 8, '0.00 0.55 0.46');
  addText('Invitation to Partner with 7a-side', 48, 704, 20, '0.07 0.10 0.16');
  addText(today, 452, 708, 9, '0.39 0.46 0.56');
  addText('7a-side -> Field Partner', 402, 694, 8, '0.39 0.46 0.56');
  addText('Business Partnership Request', 393, 682, 8, '0.39 0.46 0.56');
  addLine(48, 670, 547, 670);

  addRect(48, 590, 499, 58, '0.96 0.98 0.99');
  addText('PREPARED FOR', 66, 630, 8, '0.39 0.46 0.56');
  addText(businessName, 66, 615, 12, '0.07 0.10 0.16');
  addText('Football field owner or operator', 66, 600, 8, '0.39 0.46 0.56');
  addText('PROPOSAL DETAILS', 320, 630, 8, '0.39 0.46 0.56');
  addText('Commercials', 320, 615, 8, '0.07 0.10 0.16');
  addText(`${platformFee} earned by 7a-side per booking hour`, 320, 603, 8, '0.20 0.25 0.33');
  addText('Merchant readiness', 320, 588, 8, '0.07 0.10 0.16');
  addText('APS, Wave, or Yonna merchant account required', 320, 576, 8, '0.20 0.25 0.33');

  let y = 552;
  addText('Dear Field Partner,', 48, y, 10);
  y -= 28;
  y = addWrapped(
    `We are pleased to introduce 7a-side to ${businessName} as a practical booking and payment platform for football fields that want stronger visibility, easier booking coordination, and a more organized customer experience.`,
    48,
    y,
    10,
    92
  );
  y -= 10;
  y = addWrapped(
    '7a-side helps players discover available fields, reserve time slots, and complete booking payments with less manual back-and-forth. For field owners, the platform creates a simple channel to receive demand, manage availability, and support a more professional booking process.',
    48,
    y,
    10,
    92
  );
  y -= 10;
  y = addWrapped(
    `Under the proposed commercial arrangement, 7a-side earns ${platformFee} for every booking hour completed through the platform. ${businessName} keeps the remaining booking revenue according to the hourly price listed for the field.`,
    48,
    y,
    10,
    92
  );
  y -= 18;

  addText('How 7a-side can support your field', 48, y, 12, '0.07 0.10 0.16');
  y -= 20;
  const bullets = [
    'Increase visibility for players looking for available football fields.',
    'Reduce manual booking coordination with a structured reservation flow.',
    'Support payment collection through local wallet merchant channels.',
    'Track booking activity in one platform for clearer operational oversight.',
    'Create a professional onboarding path for fields ready to accept digital bookings.',
  ];
  for (const bullet of bullets) {
    addText('-', 52, y, 10, '0.00 0.55 0.46');
    addText(bullet, 66, y, 9, '0.00 0.45 0.39');
    y -= 17;
  }

  addRect(48, 86, 499, 76, '0.00 0.58 0.50');
  addText('Recommended next step', 66, 138, 10, '1 1 1');
  addWrapped(
    'Please reply to confirm your preferred contact person, field location, hourly rate, available time slots, and merchant account provider. The field must have an APS, Wave, or Yonna merchant account before onboarding can be completed.',
    66,
    121,
    8,
    90,
    11,
    '1 1 1'
  );

  addText('This document is a partnership request and is subject to final agreement between the parties.', 48, 54, 8, '0.39 0.46 0.56');
  return commands.join('\n');
}

function buildContractProposalPdf(variables: ContractInvitationVariables = {}) {
  const logo = getLogoForPdf();
  const stream = buildPdfTextStream(Boolean(logo), variables);
  const compressedLogo = logo ? zlib.deflateSync(logo.rgb) : null;
  const resourceXObject = logo ? ' /XObject << /Logo 6 0 R >>' : '';
  const objects = [
    Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1'),
    Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'latin1'),
    Buffer.from(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >>${resourceXObject} >> /Contents 4 0 R >>\nendobj\n`, 'latin1'),
    Buffer.from(`4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`, 'latin1'),
    Buffer.from('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'latin1'),
    ...(logo && compressedLogo ? [
      Buffer.concat([
        Buffer.from(`6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedLogo.length} >>\nstream\n`, 'latin1'),
        compressedLogo,
        Buffer.from('\nendstream\nendobj\n', 'latin1'),
      ]),
    ] : []),
  ];

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

function getProposalAttachment(variables: ContractInvitationVariables = {}) {
  return {
    filename: CONTRACT_INVITATION_PROPOSAL_FILENAME,
    content: buildContractProposalPdf(variables),
    contentType: 'application/pdf',
  };
}

export async function sendContractInvitationEmail({
  to,
  cc = [],
  subject,
  messageText,
  messageHtml,
  businessName,
  platformFeePerHour,
}: SendContractInvitationParams) {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is not configured');
  }

  const from = `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;
  const result = await resend.emails.send({
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject,
    text: messageText,
    html: messageHtml,
    attachments: [getProposalAttachment({ businessName, platformFeePerHour })],
  } as any);

  const response = result as any;
  if (response?.error) {
    throw new Error(response.error?.message || 'Failed to send contract invitation email');
  }

  return response?.data?.id || response?.id || null;
}
