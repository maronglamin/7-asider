import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || '7-aside';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const CONTRACT_INVITATION_PROPOSAL_FILENAME = '7a-side-field-partnership-proposal.txt';

export type ContractInvitationTemplateType = 'DEFAULT' | 'CUSTOM';

export type ContractInvitationTemplate = {
  subject: string;
  messageText: string;
  messageHtml: string;
};

type SendContractInvitationParams = ContractInvitationTemplate & {
  to: string;
  cc?: string[];
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

export function getDefaultContractInvitationTemplate(recipientName?: string | null): ContractInvitationTemplate {
  const safeName = recipientName?.trim() || 'there';
  const subject = '7a-side Field Partnership Invitation';
  const messageText = [
    `Hello ${safeName},`,
    '',
    'We are inviting your field to partner with 7a-side, a platform that helps football players discover, book, and pay for available football fields more easily.',
    '',
    'Under this partnership, for every booking hour completed through 7a-side, 7a-side earns GMD100. Your field keeps the remaining booking revenue according to your listed hourly price.',
    '',
    'To support smooth payment collection and settlement, the field must have a merchant account with one of the local wallet providers: APS, Wave, or Yonna.',
    '',
    'Please review the attached proposal and reply to this email with any questions or the next steps for onboarding your field.',
    '',
    'Regards,',
    'The 7a-side Team',
  ].join('\n');

  return {
    subject,
    messageText,
    messageHtml: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">7a-side Field Partnership Invitation</h2>
        ${textToHtml(messageText)}
      </div>
    `,
  };
}

function getProposalAttachment() {
  const proposalPath = path.resolve(__dirname, '..', '..', 'assets', 'contract-proposal.txt');
  const content = fs.readFileSync(proposalPath);
  return {
    filename: CONTRACT_INVITATION_PROPOSAL_FILENAME,
    content,
  };
}

export async function sendContractInvitationEmail({ to, cc = [], subject, messageText, messageHtml }: SendContractInvitationParams) {
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
    attachments: [getProposalAttachment()],
  } as any);

  const response = result as any;
  if (response?.error) {
    throw new Error(response.error?.message || 'Failed to send contract invitation email');
  }

  return response?.data?.id || response?.id || null;
}
