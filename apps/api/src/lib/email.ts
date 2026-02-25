import { DateTime } from 'luxon';

export type EmailBindings = {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

export type BookingConfirmationEmailInput = {
  inviteeEmail: string;
  inviteeName: string;
  organizerDisplayName: string;
  eventName: string;
  startsAt: string;
  timezone: string;
  locationType: string;
  locationValue: string | null;
};

export type EmailSendResult = {
  sent: boolean;
  provider: 'resend' | 'none';
  messageId?: string;
  error?: string;
};

const formatDateForTimezone = (isoDate: string, timezone: string): string => {
  const date = DateTime.fromISO(isoDate, { zone: 'utc' }).setZone(timezone);
  if (!date.isValid) {
    return isoDate;
  }
  return date.toLocaleString(DateTime.DATETIME_FULL);
};

export const sendBookingConfirmationEmail = async (
  env: EmailBindings,
  input: BookingConfirmationEmailInput,
): Promise<EmailSendResult> => {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return {
      sent: false,
      provider: 'none',
      error: 'Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).',
    };
  }

  const when = formatDateForTimezone(input.startsAt, input.timezone);
  const location = input.locationValue?.trim() || input.locationType;
  const subject = `Booking confirmed: ${input.eventName}`;
  const text = [
    `Hi ${input.inviteeName},`,
    '',
    `Your booking with ${input.organizerDisplayName} is confirmed.`,
    `Event: ${input.eventName}`,
    `When: ${when} (${input.timezone})`,
    `Location: ${location}`,
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.inviteeEmail],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    return {
      sent: false,
      provider: 'resend',
      error: bodyText || `Resend send failed with status ${response.status}.`,
    };
  }

  const body = (await response.json()) as { id?: string };
  if (body.id) {
    return {
      sent: true,
      provider: 'resend',
      messageId: body.id,
    };
  }

  return {
    sent: true,
    provider: 'resend',
  };
};
