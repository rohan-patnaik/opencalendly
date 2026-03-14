'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';

import { DemoQuotaCard } from '../../components/demo-quota-card';
import type { AuthSession } from '../../lib/auth-session';
import type { DemoFeatureCostKey, DemoQuotaStatusResponse } from '../../lib/demo-quota';
import { formatSlot } from '../../lib/public-booking';
import type { ActionStatus, BookingActionLookupResponse } from './types';

type BookingActionStyles = Record<string, string>;

export const BookingActionLoadingState = ({ styles }: { styles: BookingActionStyles }) => {
  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Booking actions</p>
        <h1>Loading link...</h1>
      </section>
    </main>
  );
};

export const BookingActionSignInState = ({
  apiBaseUrl,
  session,
  status,
  loading,
  error,
  signInHref,
  featureKeys,
  refreshDemoQuota,
  actionStatusLabel,
  message,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  status: DemoQuotaStatusResponse | null;
  loading: boolean;
  error: string | null;
  signInHref: string;
  featureKeys: DemoFeatureCostKey[];
  refreshDemoQuota: () => Promise<unknown> | void;
  actionStatusLabel: string;
  message: string;
  styles: BookingActionStyles;
}) => {
  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Launch demo action</p>
        <p className={styles.statusPill}>Link status: {actionStatusLabel}</p>
        <h1>Sign in to continue</h1>
        <p className={styles.error}>{message}</p>
      </section>

      <section className={styles.layout}>
        <DemoQuotaCard
          apiBaseUrl={apiBaseUrl}
          session={session}
          status={status}
          loading={loading}
          error={error}
          signInHref={signInHref}
          waitlistSource="demo-booking-action"
          featureKeys={featureKeys}
          onStatusChange={refreshDemoQuota}
        />
      </section>
    </main>
  );
};

export const BookingActionUnavailableState = ({
  actionStatus,
  actionStatusLabel,
  error,
  styles,
}: {
  actionStatus: ActionStatus;
  actionStatusLabel: string;
  error: string | null;
  styles: BookingActionStyles;
}) => {
  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Booking actions</p>
        <p className={styles.statusPill}>Link status: {actionStatusLabel}</p>
        <h1>{actionStatus === 'expired' ? 'This link has expired' : 'This link is unavailable'}</h1>
        <p className={styles.error}>{error || 'This booking link is no longer active.'}</p>
        <Link className={styles.secondaryButton} href="/">
          Go home
        </Link>
      </section>
    </main>
  );
};

export const BookingActionHero = ({
  actionData,
  actionStatusLabel,
  styles,
  statusLabel,
}: {
  actionData: BookingActionLookupResponse;
  actionStatusLabel: string;
  styles: BookingActionStyles;
  statusLabel: (status: BookingActionLookupResponse['booking']['status']) => string;
}) => {
  return (
    <section className={styles.heroCard}>
      <p className={styles.kicker}>Booking actions</p>
      <p className={styles.statusPill}>Link status: {actionStatusLabel}</p>
      <h1>{actionData.eventType.name}</h1>
      <p>
        Invitee: <strong>{actionData.booking.inviteeName}</strong> ({actionData.booking.inviteeEmail})
      </p>
      <p>
        Status: <strong>{statusLabel(actionData.booking.status)}</strong>
      </p>
      <p>
        Scheduled for <strong>{formatSlot(actionData.booking.startsAt, actionData.booking.timezone)}</strong>
      </p>
      {actionData.booking.team ? (
        <p>
          Team mode: <strong>{actionData.booking.team.mode.replace('_', ' ')}</strong>
        </p>
      ) : (
        <p>
          Organizer: <strong>{actionData.organizer.displayName}</strong>
        </p>
      )}
    </section>
  );
};

export const BookingActionQuotaCard = ({
  apiBaseUrl,
  session,
  status,
  loading,
  error,
  featureKeys,
  refreshDemoQuota,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  status: DemoQuotaStatusResponse | null;
  loading: boolean;
  error: string | null;
  featureKeys: DemoFeatureCostKey[];
  refreshDemoQuota: () => Promise<unknown> | void;
  styles: BookingActionStyles;
}) => {
  return (
    <section className={styles.card}>
      <DemoQuotaCard
        apiBaseUrl={apiBaseUrl}
        session={session}
        status={status}
        loading={loading}
        error={error}
        waitlistSource="demo-booking-action"
        featureKeys={featureKeys}
        onStatusChange={refreshDemoQuota}
      />
    </section>
  );
};

export const BookingActionRescheduleSection = ({
  timezone,
  timezoneOptions,
  loadingAvailability,
  slots,
  slotGroups,
  selectedSlot,
  onSelectSlot,
  onTimezoneChange,
  selectedSlotLabel,
  bookingPageHref,
  submittingReschedule,
  onSubmit,
  styles,
}: {
  timezone: string;
  timezoneOptions: string[];
  loadingAvailability: boolean;
  slots: Array<{ startsAt: string; endsAt: string; assignmentUserIds?: string[] }>;
  slotGroups: Array<{ dateKey: string; label: string; slots: Array<{ startsAt: string; endsAt: string; assignmentUserIds?: string[] }> }>;
  selectedSlot: string;
  onSelectSlot: (slot: string) => void;
  onTimezoneChange: (value: string) => void;
  selectedSlotLabel: string | null;
  bookingPageHref: string;
  submittingReschedule: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  styles: BookingActionStyles;
}) => {
  return (
    <section className={styles.layout}>
      <div className={styles.card}>
        <h2>Choose a new time</h2>
        <label className={styles.label} htmlFor="reschedule-timezone">
          Timezone
        </label>
        <select
          id="reschedule-timezone"
          className={styles.select}
          value={timezone}
          onChange={(entry) => onTimezoneChange(entry.target.value)}
        >
          {timezoneOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        {loadingAvailability ? <p className={styles.muted}>Loading available times...</p> : null}
        {!loadingAvailability && slots.length === 0 ? (
          <p className={styles.muted}>No times are available right now. Try another timezone.</p>
        ) : null}

        <div className={styles.slotDayStack}>
          {slotGroups.map((group) => (
            <section key={group.dateKey} className={styles.slotDay}>
              <h3>{group.label}</h3>
              <div className={styles.slotGrid}>
                {group.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    className={slot.startsAt === selectedSlot ? styles.slotActive : styles.slot}
                    onClick={() => onSelectSlot(slot.startsAt)}
                  >
                    {new Intl.DateTimeFormat(undefined, {
                      timeStyle: 'short',
                      timeZone: timezone,
                    }).format(new Date(slot.startsAt))}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <h2>Confirm reschedule</h2>
        {selectedSlotLabel ? (
          <p className={styles.selection}>
            New time: <strong>{selectedSlotLabel}</strong>
          </p>
        ) : (
          <p className={styles.selection}>Choose a time before continuing.</p>
        )}
        <form className={styles.form} onSubmit={onSubmit}>
          <button className={styles.primaryButton} type="submit" disabled={submittingReschedule}>
            {submittingReschedule ? 'Rescheduling...' : 'Reschedule'}
          </button>
        </form>
        <Link className={styles.inlineLink} href={bookingPageHref}>
          Open booking page
        </Link>
      </div>
    </section>
  );
};

export const BookingActionCancelSection = ({
  cancelReason,
  onCancelReasonChange,
  submittingCancel,
  onSubmit,
  styles,
}: {
  cancelReason: string;
  onCancelReasonChange: (value: string) => void;
  submittingCancel: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  styles: BookingActionStyles;
}) => {
  return (
    <section className={styles.card}>
      <h2>Cancel booking</h2>
      <p className={styles.muted}>Add an optional note for the host.</p>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label} htmlFor="cancel-reason">
          Note (optional)
        </label>
        <textarea
          id="cancel-reason"
          className={styles.textarea}
          value={cancelReason}
          onChange={(entry) => onCancelReasonChange(entry.target.value)}
          rows={3}
          placeholder="Need to move this out by a week."
        />
        <button className={styles.dangerButton} type="submit" disabled={submittingCancel}>
          {submittingCancel ? 'Canceling...' : 'Cancel booking'}
        </button>
      </form>
    </section>
  );
};

export const BookingActionCompleteSection = ({
  actionData,
  bookingPageHref,
  styles,
}: {
  actionData: BookingActionLookupResponse;
  bookingPageHref: string;
  styles: BookingActionStyles;
}) => {
  return (
    <section className={styles.card}>
      <h2>Action complete</h2>
      {actionData.booking.status === 'rescheduled' && actionData.booking.rescheduledTo ? (
        <p>
          This booking was already moved to{' '}
          <strong>{formatSlot(actionData.booking.rescheduledTo.startsAt, actionData.booking.timezone)}</strong>.
        </p>
      ) : null}
      {actionData.booking.status === 'canceled' ? <p>This booking was already canceled.</p> : null}
      <Link className={styles.secondaryButton} href={bookingPageHref}>
        Open booking page
      </Link>
    </section>
  );
};
