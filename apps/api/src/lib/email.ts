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
  cancelLink?: string;
  rescheduleLink?: string;
  idempotencyKey?: string;
};

export type BookingCancellationEmailInput = {
  recipientEmail: string;
  recipientName: string;
  recipientRole: 'invitee' | 'organizer';
  organizerDisplayName: string;
  eventName: string;
  startsAt: string;
  timezone: string;
  cancellationReason?: string | null;
  idempotencyKey?: string;
};

export type BookingRescheduledEmailInput = {
  recipientEmail: string;
  recipientName: string;
  recipientRole: 'invitee' | 'organizer';
  organizerDisplayName: string;
  eventName: string;
  oldStartsAt: string;
  newStartsAt: string;
  timezone: string;
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

const sendTextEmail = async (
  env: EmailBindings,
  input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey?: string;
  },
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
          to: [input.to],
          subject: input.subject,
          text: input.text,
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

export const sendBookingConfirmationEmail = async (
  env: EmailBindings,
  input: BookingConfirmationEmailInput,
): Promise<EmailSendResult> => {
  const when = formatDateForTimezone(input.startsAt, input.timezone);
  const location = input.locationValue?.trim() || input.locationType;
  const subject = `Booking confirmed: ${input.eventName}`;
  const textLines = [
    `Hi ${input.inviteeName},`,
    '',
    `Your booking with ${input.organizerDisplayName} is confirmed.`,
    `Event: ${input.eventName}`,
    `When: ${when} (${input.timezone})`,
    `Location: ${location}`,
  ];

  if (input.cancelLink) {
    textLines.push(`Cancel link: ${input.cancelLink}`);
  }
  if (input.rescheduleLink) {
    textLines.push(`Reschedule link: ${input.rescheduleLink}`);
  }

  return sendTextEmail(env, {
    to: input.inviteeEmail,
    subject,
    text: textLines.join('\n'),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
};

export const sendBookingCancellationEmail = async (
  env: EmailBindings,
  input: BookingCancellationEmailInput,
): Promise<EmailSendResult> => {
  const when = formatDateForTimezone(input.startsAt, input.timezone);
  const subject = `Booking canceled: ${input.eventName}`;
  const textLines = [
    `Hi ${input.recipientName},`,
    '',
    input.recipientRole === 'invitee'
      ? 'You have canceled your booking.'
      : 'Your invitee has canceled their booking.',
    `Event: ${input.eventName}`,
    `Original time: ${when} (${input.timezone})`,
  ];

  if (input.cancellationReason) {
    textLines.push(`Reason: ${input.cancellationReason}`);
  }

  return sendTextEmail(env, {
    to: input.recipientEmail,
    subject,
    text: textLines.join('\n'),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
};

export const sendBookingRescheduledEmail = async (
  env: EmailBindings,
  input: BookingRescheduledEmailInput,
): Promise<EmailSendResult> => {
  const oldWhen = formatDateForTimezone(input.oldStartsAt, input.timezone);
  const newWhen = formatDateForTimezone(input.newStartsAt, input.timezone);
  const subject = `Booking rescheduled: ${input.eventName}`;
  const text = [
    `Hi ${input.recipientName},`,
    '',
    input.recipientRole === 'invitee'
      ? 'You have rescheduled your booking.'
      : 'Your invitee has rescheduled their booking.',
    `Event: ${input.eventName}`,
    `Previous time: ${oldWhen} (${input.timezone})`,
    `New time: ${newWhen} (${input.timezone})`,
  ].join('\n');

  return sendTextEmail(env, {
    to: input.recipientEmail,
    subject,
    text,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
};
