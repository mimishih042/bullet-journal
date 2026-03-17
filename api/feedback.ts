import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Replace 'onboarding@resend.dev' with your verified custom domain sender once set up in Resend
const FROM    = 'onboarding@resend.dev';
const TO      = 'shih.meitsen@gmail.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, context } = req.body as { message?: string; context?: string };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    await resend.emails.send({
      from: FROM,
      to:   TO,
      subject: `New Feedback (${context ?? 'general'})`,
      text: [
        `Context:   ${context ?? '—'}`,
        `Timestamp: ${new Date().toUTCString()}`,
        '',
        message.trim(),
      ].join('\n'),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[feedback]', err);
    return res.status(500).json({ error: 'Failed to send' });
  }
}
