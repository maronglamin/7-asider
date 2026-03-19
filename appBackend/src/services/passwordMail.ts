import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || '7-aside';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

type ForgotPasswordMailParams = {
  to: string;
  name?: string | null;
  temporaryPassword: string;
};

export async function sendForgotPasswordEmail({ to, name, temporaryPassword }: ForgotPasswordMailParams) {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is not configured');
  }

  const safeName = name?.trim() || 'there';
  const from = `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;

  await resend.emails.send({
    from,
    to,
    subject: 'Your 7-aside password has been reset',
    text: [
      `Hello ${safeName},`,
      '',
      'We received a password reset request for your 7-aside account.',
      `Your new temporary password is: ${temporaryPassword}`,
      '',
      'Please sign in with this password and change it immediately from your profile.',
      '',
      'If you did not request this change, please contact support right away.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">Password Reset</h2>
        <p>Hello ${safeName},</p>
        <p>We received a password reset request for your 7-aside account.</p>
        <p>
          Your new temporary password is:
          <strong style="display: inline-block; margin-left: 6px;">${temporaryPassword}</strong>
        </p>
        <p>Please sign in with this password and change it immediately from your profile.</p>
        <p>If you did not request this change, please contact support right away.</p>
      </div>
    `,
  });
}
