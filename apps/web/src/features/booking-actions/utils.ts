import type { DemoFeatureCostKey } from '../../lib/demo-quota';
import type { BookingActionLookupResponse } from './types';

export const isLaunchDemoActionPayload = (payload: BookingActionLookupResponse) => {
  return (
    payload.organizer.username.trim().toLowerCase() === 'demo' ||
    payload.booking.team?.teamSlug?.trim().toLowerCase() === 'demo-team'
  );
};

export const statusLabel = (status: BookingActionLookupResponse['booking']['status']): string => {
  if (status === 'confirmed') {
    return 'Confirmed';
  }
  if (status === 'canceled') {
    return 'Canceled';
  }
  return 'Rescheduled';
};

export const buildQuotaFeatureKeys = (
  actionData: BookingActionLookupResponse | null,
): DemoFeatureCostKey[] => {
  if (actionData?.actions.canReschedule) {
    return ['booking_reschedule', 'booking_cancel'];
  }
  if (actionData?.actions.canCancel) {
    return ['booking_cancel'];
  }
  return ['booking_cancel', 'booking_reschedule'];
};

export const buildBookingPageHref = (actionData: BookingActionLookupResponse | null): string => {
  if (!actionData) {
    return '/';
  }
  if (actionData.booking.team?.teamSlug) {
    return `/team/${encodeURIComponent(actionData.booking.team.teamSlug)}/${encodeURIComponent(actionData.eventType.slug)}`;
  }
  return `/${encodeURIComponent(actionData.organizer.username)}/${encodeURIComponent(actionData.eventType.slug)}`;
};

export const buildActionStatusLabel = (actionStatus: 'active' | 'invalid' | 'expired'): string => {
  if (actionStatus === 'expired') {
    return 'Expired';
  }
  if (actionStatus === 'invalid') {
    return 'Invalid';
  }
  return 'Active';
};
