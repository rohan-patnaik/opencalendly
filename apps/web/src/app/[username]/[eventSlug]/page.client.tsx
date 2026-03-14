'use client';

import {
  BookingActionLinks,
  BookingDemoGate,
  BookingInlineQuotaCard,
  BookingLoadingState,
  BookingQuestionFields,
  BookingSlotPicker,
  BookingUnavailableState,
} from '../../../features/booking/components';
import { readableLocation } from '../../../features/booking/common';
import { useOneOnOneBooking } from '../../../features/booking/use-one-on-one-booking';
import styles from './page.module.css';

type BookingPageClientProps = {
  username: string;
  eventSlug: string;
  apiBaseUrl: string;
};

export default function BookingPageClient({ username, eventSlug, apiBaseUrl }: BookingPageClientProps) {
  const booking = useOneOnOneBooking({ username, eventSlug, apiBaseUrl });

  if (booking.loadingEvent || (booking.isLaunchDemoPage && !booking.ready)) {
    return <BookingLoadingState styles={styles} kicker="Booking" title="Loading event..." />;
  }

  if (booking.isLaunchDemoPage && !booking.session) {
    return (
      <BookingDemoGate
        styles={styles}
        kicker="Launch demo"
        title="Sign in to book the demo"
        body="Please sign in first so the shared demo capacity stays available for real sessions."
        apiBaseUrl={apiBaseUrl}
        session={booking.session}
        status={booking.demoQuotaStatus}
        loading={booking.demoQuotaLoading}
        error={booking.demoQuotaError}
        signInHref={booking.signInHref}
        waitlistSource="demo-booking"
        featureKeys={['one_on_one_booking']}
        onStatusChange={booking.refreshDemoQuota}
      />
    );
  }

  if (!booking.eventData) {
    return (
      <BookingUnavailableState
        styles={styles}
        kicker="Public booking"
        title="Event unavailable"
        error={booking.pageError || 'Event not found.'}
      />
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Open booking link</p>
        <h1>{booking.eventData.eventType.name}</h1>
        <p>
          Hosted by <strong>{booking.eventData.organizer.displayName}</strong> ·{' '}
          {booking.eventData.eventType.durationMinutes} minutes
        </p>
        <p>
          Location:{' '}
          {readableLocation(
            booking.eventData.eventType.locationType,
            booking.eventData.eventType.locationValue,
          )}
        </p>
      </section>

      <section className={styles.layout}>
        <BookingSlotPicker
          styles={styles}
          title="Pick a time"
          description="Times are shown in your timezone."
          timezoneId="timezone"
          timezone={booking.timezone}
          timezoneOptions={booking.timezoneOptions}
          onTimezoneChange={booking.setTimezone}
          organizerTimezoneText={
            <>
              Organizer timezone: <strong>{booking.eventData.organizer.timezone}</strong>
            </>
          }
          loadingText="Loading slots..."
          emptyText="No slots available in the next 7 days."
          loading={booking.loadingSlots}
          slotsCount={booking.slots.length}
          slotGroups={booking.slotGroups}
          selectedSlot={booking.selectedSlot}
          onSelectSlot={booking.setSelectedSlot}
          renderSlotLabel={(slotStartsAt) =>
            new Intl.DateTimeFormat(undefined, {
              timeStyle: 'short',
              timeZone: booking.timezone,
            }).format(new Date(slotStartsAt))
          }
        />

        <div className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>Your details</h2>
            <p>We’ll send your confirmation and booking links by email.</p>
          </div>

          {booking.selectedSlotLabel ? (
            <p className={styles.selection}>
              Selected time: <strong>{booking.selectedSlotLabel}</strong>
            </p>
          ) : (
            <p className={styles.selection}>Choose a time to continue.</p>
          )}

          {booking.isLaunchDemoPage ? (
            <BookingInlineQuotaCard
              apiBaseUrl={apiBaseUrl}
              session={booking.session}
              status={booking.demoQuotaStatus}
              loading={booking.demoQuotaLoading}
              error={booking.demoQuotaError}
              waitlistSource="demo-booking"
              featureKeys={['one_on_one_booking']}
              onStatusChange={booking.refreshDemoQuota}
            />
          ) : null}

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void booking.submitBooking();
            }}
          >
            <label className={styles.label} htmlFor="invitee-name">
              Your name
            </label>
            <input
              id="invitee-name"
              className={styles.input}
              value={booking.inviteeName}
              onChange={(event) => booking.setInviteeName(event.target.value)}
              required
            />

            <label className={styles.label} htmlFor="invitee-email">
              Your email
            </label>
            <input
              id="invitee-email"
              type="email"
              className={styles.input}
              value={booking.inviteeEmail}
              onChange={(event) => booking.setInviteeEmail(event.target.value)}
              required
            />

            <BookingQuestionFields
              styles={styles}
              prefix="booking-question"
              questions={booking.eventData.eventType.questions}
              answers={booking.answers}
              onAnswerChange={booking.setAnswer}
            />

            <button className={styles.primaryButton} type="submit" disabled={booking.submitting}>
              {booking.submitting ? 'Booking...' : 'Confirm booking'}
            </button>
          </form>

          {booking.pageError ? <p className={styles.error}>{booking.pageError}</p> : null}
          {booking.confirmation ? (
            <p className={styles.confirmation}>{booking.confirmation}</p>
          ) : null}
          {booking.deliveryStatus ? <p className={styles.notice}>{booking.deliveryStatus}</p> : null}
          <BookingActionLinks styles={styles} actionLinks={booking.actionLinks} />
        </div>
      </section>
    </main>
  );
}
