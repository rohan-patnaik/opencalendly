'use client';

import {
  BookingActionLinks,
  BookingDemoGate,
  BookingInlineQuotaCard,
  BookingLoadingState,
  BookingQuestionFields,
  BookingSlotPicker,
  BookingUnavailableState,
} from '../../../../features/booking/components';
import { readableLocation } from '../../../../features/booking/common';
import { useTeamBooking } from '../../../../features/booking/use-team-booking';
import { formatSlot } from '../../../../lib/public-booking';
import styles from './page.module.css';

type TeamBookingPageClientProps = {
  teamSlug: string;
  eventSlug: string;
  apiBaseUrl: string;
};

export default function TeamBookingPageClient({
  teamSlug,
  eventSlug,
  apiBaseUrl,
}: TeamBookingPageClientProps) {
  const booking = useTeamBooking({ teamSlug, eventSlug, apiBaseUrl });

  if (booking.loadingEvent || (booking.isLaunchDemoPage && !booking.ready)) {
    return <BookingLoadingState styles={styles} kicker="Team booking" title="Loading team event..." />;
  }

  if (booking.isLaunchDemoPage && !booking.session) {
    return (
      <BookingDemoGate
        styles={styles}
        kicker="Launch demo"
        title="Sign in to book the team demo"
        body="Team demo traffic is gated during launch so anonymous users cannot burn the shared pool."
        apiBaseUrl={apiBaseUrl}
        session={booking.session}
        status={booking.demoQuotaStatus}
        loading={booking.demoQuotaLoading}
        error={booking.demoQuotaError}
        signInHref={booking.signInHref}
        waitlistSource="demo-team-booking"
        featureKeys={['team_booking']}
        onStatusChange={booking.refreshDemoQuota}
      />
    );
  }

  if (!booking.teamEvent) {
    return (
      <BookingUnavailableState
        styles={styles}
        kicker="Team booking"
        title="Team event unavailable"
        error={booking.error || 'Team event type not found.'}
      />
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Team booking link</p>
        <h1>{booking.teamEvent.eventType.name}</h1>
        <p>
          Team: <strong>{booking.teamEvent.team.name}</strong> · Mode:{' '}
          <strong>{booking.teamEvent.mode.replaceAll('_', ' ')}</strong>
        </p>
        <p>
          Duration: {booking.teamEvent.eventType.durationMinutes} min · Location:{' '}
          {readableLocation(
            booking.teamEvent.eventType.locationType,
            booking.teamEvent.eventType.locationValue,
          )}
        </p>
      </section>

      <section className={styles.layout}>
        <BookingSlotPicker
          styles={styles}
          title="Choose a slot"
          timezoneId="team-timezone"
          timezone={booking.timezone}
          timezoneOptions={booking.timezoneOptions}
          onTimezoneChange={booking.setTimezone}
          loadingText="Loading slots..."
          emptyText="No team slots available in the next 7 days."
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
          <h2>Confirm team booking</h2>
          {booking.selectedSlotDetails ? (
            <p className={styles.selection}>
              {formatSlot(booking.selectedSlotDetails.startsAt, booking.timezone)} ·{' '}
              {booking.selectedSlotDetails.assignmentUserIds.length} assigned member(s)
            </p>
          ) : (
            <p className={styles.selection}>Select a slot to continue.</p>
          )}

          {booking.isLaunchDemoPage ? (
            <BookingInlineQuotaCard
              apiBaseUrl={apiBaseUrl}
              session={booking.session}
              status={booking.demoQuotaStatus}
              loading={booking.demoQuotaLoading}
              error={booking.demoQuotaError}
              waitlistSource="demo-team-booking"
              featureKeys={['team_booking']}
              onStatusChange={booking.refreshDemoQuota}
            />
          ) : null}

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void booking.submitTeamBooking();
            }}
          >
            <label className={styles.label} htmlFor="team-invitee-name">
              Your name
            </label>
            <input
              id="team-invitee-name"
              className={styles.input}
              value={booking.inviteeName}
              onChange={(event) => booking.setInviteeName(event.target.value)}
              required
            />

            <label className={styles.label} htmlFor="team-invitee-email">
              Your email
            </label>
            <input
              id="team-invitee-email"
              type="email"
              className={styles.input}
              value={booking.inviteeEmail}
              onChange={(event) => booking.setInviteeEmail(event.target.value)}
              required
            />

            <BookingQuestionFields
              styles={styles}
              prefix="team-question"
              questions={booking.teamEvent.eventType.questions}
              answers={booking.answers}
              onAnswerChange={booking.setAnswer}
            />

            <button className={styles.primaryButton} type="submit" disabled={booking.submitting}>
              {booking.submitting ? 'Booking...' : 'Confirm team booking'}
            </button>
          </form>

          <div className={styles.memberPanel}>
            <h3>Required members</h3>
            <ul>
              {booking.teamEvent.members.map((member) => (
                <li key={member.userId}>
                  {member.user?.displayName ?? member.userId} · {member.role}
                </li>
              ))}
            </ul>
          </div>

          {booking.error ? <p className={styles.error}>{booking.error}</p> : null}
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
