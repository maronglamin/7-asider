import { Resend } from 'resend';
import type { OtpEmailDeviceSummary } from '../device/format';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function getResendClient(): { resend: Resend; from: string } {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || '').trim();
  const fromName = (process.env.RESEND_FROM_NAME || '7-aside').trim();

  if (!apiKey || !fromEmail) {
    throw new Error('Email delivery is not configured');
  }

  const from = fromEmail.includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;
  return { resend: new Resend(apiKey), from };
}

export async function sendOtpEmail(
  to: string,
  code: string,
  options: {
    device?: OtpEmailDeviceSummary;
    accountDeviceLocked?: boolean;
  } = {},
): Promise<void> {
  const { resend, from } = getResendClient();
  const safeCode = escapeHtml(code);
  const introParagraph = options.device
    ? `You asked to sign in from <strong>${escapeHtml(options.device.deviceLabel)}</strong> (${escapeHtml(options.device.systemLabel)}). Enter this 6-digit code in the app or web browser. It expires in 10 minutes.`
    : 'Enter this 6-digit code in the app. It expires in 10 minutes.';
  const lockNote = options.accountDeviceLocked
    ? `
        <p style="color: #92400e; font-size: 14px; line-height: 1.5; margin: 0 0 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px;">
          <strong>Your account is locked to one device.</strong>
          Only sign in on the phone, tablet, or web browser you chose in Profile.
        </p>
      `
    : '';
  const subject = 'Your 7-aside sign-in code';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111827; line-height: 1.6;">
      <h2 style="color: #16a34a; margin-bottom: 8px;">Sign in to 7-aside</h2>
      <p style="color: #4b5563;">${introParagraph}</p>
      ${lockNote}
      <p style="font-size: 32px; letter-spacing: 8px; font-weight: 700; color: #111827; margin: 24px 0;">${safeCode}</p>
      <p style="color: #6b7280; font-size: 14px;">If you did not request this code, you can ignore this email.</p>
    </div>
  `;
  const textLines = [
    `Your 7-aside sign-in code is ${code}. It expires in 10 minutes.`,
    ...(options.device?.plainLines ?? []),
    ...(options.accountDeviceLocked
      ? ['Your account is locked to one device. Sign in only on the phone, tablet, or browser you chose in Profile.']
      : []),
  ];

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text: textLines.join('\n'),
    html,
  });

  if (error) {
    console.error('[otpMail] send failed', error.message);
    const detail = process.env.NODE_ENV === 'production' ? '' : ` (${error.message})`;
    throw new Error(`Failed to send verification email${detail}`);
  }
}
