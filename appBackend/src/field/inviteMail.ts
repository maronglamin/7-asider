import { Resend } from 'resend';

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

export async function sendFieldManagerInviteEmail(opts: {
  to: string;
  fieldName: string;
  ownerName: string;
  acceptUrl: string;
}): Promise<void> {
  const { resend, from } = getResendClient();
  const fieldName = escapeHtml(opts.fieldName);
  const ownerName = escapeHtml(opts.ownerName);
  const acceptUrl = escapeHtml(opts.acceptUrl);
  const subject = `${opts.ownerName} invited you to manage ${opts.fieldName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111827; line-height: 1.6;">
      <h2 style="color: #16a34a; margin-bottom: 8px;">Manage a field on 7-aside</h2>
      <p style="color: #4b5563;">
        <strong>${ownerName}</strong> invited you to manage <strong>${fieldName}</strong>.
        You can check in guests, handle bookings, and keep the field running while they are busy.
      </p>
      <p style="margin: 24px 0;">
        <a href="${acceptUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 10px;">
          Accept invite
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">This link expires in 7 days. If you do not have an account yet, create one with this same email, then open the link again.</p>
    </div>
  `;
  const text = [
    `${opts.ownerName} invited you to manage ${opts.fieldName} on 7-aside.`,
    `Accept: ${opts.acceptUrl}`,
    'This link expires in 7 days. Sign up or log in with this email, then open the link.',
  ].join('\n');

  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject,
    text,
    html,
  });

  if (error) {
    console.error('[fieldManagerInviteMail] send failed', error.message);
    const detail = process.env.NODE_ENV === 'production' ? '' : ` (${error.message})`;
    throw new Error(`Failed to send manager invite${detail}`);
  }
}
