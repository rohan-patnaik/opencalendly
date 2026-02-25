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
  idempotencyKey?: string;
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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const idempotencyKey = input.idempotencyKey?.trim();
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  let lastError = 'Resend send failed.';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from,
          to: [input.inviteeEmail],
          subject,
          text,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { id?: string };
        return {
          sent: true,
          provider: 'resend',
          ...(body.id ? { messageId: body.id } : {}),
        };
      }

      const bodyText = await response.text();
      lastError = bodyText || `Resend send failed with status ${response.status}.`;

      if (response.status >= 500 && attempt < 2) {
        continue;
      }

      return {
        sent: false,
        provider: 'resend',
        error: lastError,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Resend send failed.';
      if (attempt < 2) {
        continue;
      }
      return {
        sent: false,
        provider: 'resend',
        error: lastError,
      };
    }
  }

  return {
    sent: false,
    provider: 'resend',
    error: lastError,
  };
};
