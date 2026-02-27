export type BookingEmailPayload = {
  sent: boolean;
  error?: string;
};

export const buildEmailDeliveryMessage = (
  email: BookingEmailPayload | undefined,
  inviteeEmail: string,
): string => {
  if (!email) {
    return 'Booking confirmed. Email delivery status unavailable.';
  }

  if (email.sent) {
    return `Confirmation email sent to ${inviteeEmail}.`;
  }

  if (email.error) {
    return `Booking confirmed, but email delivery failed: ${email.error}`;
  }

  return 'Booking confirmed, but email delivery failed.';
};
