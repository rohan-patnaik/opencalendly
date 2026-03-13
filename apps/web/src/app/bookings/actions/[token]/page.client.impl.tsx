'use client';

import { useDemoQuota } from '../../../../lib/demo-quota';
import { useAuthSession } from '../../../../lib/use-auth-session';
import {
  BookingActionCancelSection,
  BookingActionCompleteSection,
  BookingActionHero,
  BookingActionLoadingState,
  BookingActionQuotaCard,
  BookingActionRescheduleSection,
  BookingActionSignInState,
  BookingActionUnavailableState,
} from '../../../../features/booking-actions/sections';
import { useBookingAction } from '../../../../features/booking-actions/use-booking-action';
import styles from './page.module.css';

type BookingActionPageClientProps = {
  token: string;
  apiBaseUrl: string;
};

export default function BookingActionPageClient({ token, apiBaseUrl }: BookingActionPageClientProps) {
  const { session, ready } = useAuthSession();
  const {
    status: demoQuotaStatus,
    loading: demoQuotaLoading,
    error: demoQuotaError,
    refresh: refreshDemoQuota,
  } = useDemoQuota({
    apiBaseUrl,
    session,
    enabled: true,
  });
  const bookingAction = useBookingAction({
    apiBaseUrl,
    token,
    ready,
    session,
    refreshDemoQuota,
  });

  if (!ready || bookingAction.loadingAction) {
    return <BookingActionLoadingState styles={styles} />;
  }

  if (bookingAction.requiresDemoAuth && !session) {
    return (
      <BookingActionSignInState
        apiBaseUrl={apiBaseUrl}
        session={session}
        status={demoQuotaStatus}
        loading={demoQuotaLoading}
        error={demoQuotaError}
        signInHref={bookingAction.signInHref}
        featureKeys={bookingAction.quotaFeatureKeys}
        refreshDemoQuota={refreshDemoQuota}
        actionStatusLabel={bookingAction.actionStatusLabel}
        message={bookingAction.error || 'This launch demo action requires authentication.'}
        styles={styles}
      />
    );
  }

  if (!bookingAction.actionData) {
    return (
      <BookingActionUnavailableState
        actionStatus={bookingAction.actionStatus}
        actionStatusLabel={bookingAction.actionStatusLabel}
        error={bookingAction.error}
        styles={styles}
      />
    );
  }

  return (
    <main className={styles.page}>
      <BookingActionHero
        actionData={bookingAction.actionData}
        actionStatusLabel={bookingAction.actionStatusLabel}
        styles={styles}
        statusLabel={bookingAction.statusLabel}
      />

      {bookingAction.isLaunchDemoAction ? (
        <BookingActionQuotaCard
          apiBaseUrl={apiBaseUrl}
          session={session}
          status={demoQuotaStatus}
          loading={demoQuotaLoading}
          error={demoQuotaError}
          featureKeys={bookingAction.quotaFeatureKeys}
          refreshDemoQuota={refreshDemoQuota}
          styles={styles}
        />
      ) : null}

      {bookingAction.actionData.actions.canReschedule ? (
        <BookingActionRescheduleSection
          timezone={bookingAction.timezone}
          timezoneOptions={bookingAction.timezoneOptions}
          loadingAvailability={bookingAction.loadingAvailability}
          slots={bookingAction.slots}
          slotGroups={bookingAction.slotGroups}
          selectedSlot={bookingAction.selectedSlot}
          onSelectSlot={bookingAction.setSelectedSlot}
          onTimezoneChange={bookingAction.setTimezone}
          selectedSlotLabel={bookingAction.selectedSlotLabel}
          bookingPageHref={bookingAction.bookingPageHref}
          submittingReschedule={bookingAction.submittingReschedule}
          onSubmit={bookingAction.submitReschedule}
          styles={styles}
        />
      ) : null}

      {bookingAction.actionData.actions.canCancel ? (
        <BookingActionCancelSection
          cancelReason={bookingAction.cancelReason}
          onCancelReasonChange={bookingAction.setCancelReason}
          submittingCancel={bookingAction.submittingCancel}
          onSubmit={bookingAction.submitCancel}
          styles={styles}
        />
      ) : null}

      {!bookingAction.actionData.actions.canCancel && !bookingAction.actionData.actions.canReschedule ? (
        <BookingActionCompleteSection
          actionData={bookingAction.actionData}
          bookingPageHref={bookingAction.bookingPageHref}
          styles={styles}
        />
      ) : null}

      {bookingAction.error ? <p className={styles.error}>{bookingAction.error}</p> : null}
      {bookingAction.success ? <p className={styles.success}>{bookingAction.success}</p> : null}
    </main>
  );
}
