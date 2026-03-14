'use client';

import React, { type ReactNode } from 'react';
import { DemoQuotaCard } from '../../components/demo-quota-card';
import type { AuthSession } from '../../lib/auth-session';
import type { DemoFeatureCostKey, DemoQuotaStatusResponse } from '../../lib/demo-quota';

type BookingStyles = Record<string, string>;

type SlotGroup = {
  dateKey: string;
  label: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
  }>;
};

type ActionLinks = {
  cancelPageUrl?: string;
  reschedulePageUrl?: string;
} | null;

export function BookingLoadingState(input: {
  styles: BookingStyles;
  kicker: string;
  title: string;
}) {
  return (
    <main className={input.styles.page}>
      <section className={input.styles.heroCard}>
        <p className={input.styles.kicker}>{input.kicker}</p>
        <h1>{input.title}</h1>
      </section>
    </main>
  );
}

export function BookingUnavailableState(input: {
  styles: BookingStyles;
  kicker: string;
  title: string;
  error: string;
}) {
  return (
    <main className={input.styles.page}>
      <section className={input.styles.heroCard}>
        <p className={input.styles.kicker}>{input.kicker}</p>
        <h1>{input.title}</h1>
        <p className={input.styles.error}>{input.error}</p>
      </section>
    </main>
  );
}

export function BookingDemoGate(input: {
  styles: BookingStyles;
  kicker: string;
  title: string;
  body: string;
  apiBaseUrl: string;
  session: AuthSession | null;
  status: DemoQuotaStatusResponse | null;
  loading: boolean;
  error: string | null;
  signInHref: string;
  waitlistSource: string;
  featureKeys: DemoFeatureCostKey[];
  onStatusChange: () => Promise<unknown>;
}) {
  return (
    <main className={input.styles.page}>
      <section className={input.styles.heroCard}>
        <p className={input.styles.kicker}>{input.kicker}</p>
        <h1>{input.title}</h1>
        <p>{input.body}</p>
      </section>

      <section className={input.styles.layout}>
        <DemoQuotaCard
          apiBaseUrl={input.apiBaseUrl}
          session={input.session}
          status={input.status}
          loading={input.loading}
          error={input.error}
          signInHref={input.signInHref}
          waitlistSource={input.waitlistSource}
          featureKeys={input.featureKeys}
          onStatusChange={input.onStatusChange}
        />
      </section>
    </main>
  );
}

export function BookingInlineQuotaCard(input: {
  apiBaseUrl: string;
  session: AuthSession | null;
  status: DemoQuotaStatusResponse | null;
  loading: boolean;
  error: string | null;
  waitlistSource: string;
  featureKeys: DemoFeatureCostKey[];
  onStatusChange: () => Promise<unknown>;
}) {
  return (
    <DemoQuotaCard
      apiBaseUrl={input.apiBaseUrl}
      session={input.session}
      status={input.status}
      loading={input.loading}
      error={input.error}
      waitlistSource={input.waitlistSource}
      featureKeys={input.featureKeys}
      onStatusChange={input.onStatusChange}
    />
  );
}

export function BookingSlotPicker(input: {
  styles: BookingStyles;
  title: string;
  description?: string;
  timezoneId: string;
  timezone: string;
  timezoneOptions: string[];
  onTimezoneChange: (timezone: string) => void;
  organizerTimezoneText?: ReactNode;
  loadingText: string;
  emptyText: string;
  loading: boolean;
  slotsCount: number;
  slotGroups: SlotGroup[];
  selectedSlot: string;
  onSelectSlot: (slotStartsAt: string) => void;
  renderSlotLabel: (slotStartsAt: string) => string;
}) {
  return (
    <div className={input.styles.card}>
      <div className={input.styles.sectionHead}>
        <h2>{input.title}</h2>
        {input.description ? <p>{input.description}</p> : null}
      </div>

      <label className={input.styles.label} htmlFor={input.timezoneId}>
        Timezone
      </label>
      <select
        id={input.timezoneId}
        className={input.styles.select}
        value={input.timezone}
        onChange={(event) => input.onTimezoneChange(event.target.value)}
      >
        {input.timezoneOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {input.organizerTimezoneText ? (
        <p className={input.styles.muted}>{input.organizerTimezoneText}</p>
      ) : null}

      {input.loading ? <p className={input.styles.muted}>{input.loadingText}</p> : null}
      {!input.loading && input.slotsCount === 0 ? (
        <p className={input.styles.muted}>{input.emptyText}</p>
      ) : null}

      <div className={input.styles.slotDayStack}>
        {input.slotGroups.map((group) => (
          <section key={group.dateKey} className={input.styles.slotDay}>
            <h3>{group.label}</h3>
            <div className={input.styles.slotGrid}>
              {group.slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  className={
                    slot.startsAt === input.selectedSlot
                      ? input.styles.slotActive
                      : input.styles.slot
                  }
                  onClick={() => input.onSelectSlot(slot.startsAt)}
                >
                  {input.renderSlotLabel(slot.startsAt)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function BookingQuestionFields(input: {
  styles: BookingStyles;
  prefix: string;
  questions: Array<{
    id: string;
    label: string;
    required: boolean;
    placeholder?: string;
  }>;
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
}) {
  return (
    <>
      {input.questions.map((question) => (
        <label
          key={question.id}
          className={input.styles.label}
          htmlFor={`${input.prefix}-${question.id}`}
        >
          {question.label}
          <input
            id={`${input.prefix}-${question.id}`}
            className={input.styles.input}
            value={input.answers[question.id] ?? ''}
            onChange={(event) => input.onAnswerChange(question.id, event.target.value)}
            placeholder={question.placeholder ?? ''}
            required={question.required}
          />
        </label>
      ))}
    </>
  );
}

export function BookingActionLinks(input: {
  styles: BookingStyles;
  actionLinks: ActionLinks;
}) {
  if (!input.actionLinks) {
    return null;
  }

  return (
    <div className={input.styles.actionLinks}>
      {input.actionLinks.cancelPageUrl ? (
        <a
          className={input.styles.secondaryButton}
          href={input.actionLinks.cancelPageUrl}
          target="_top"
        >
          Open cancel link
        </a>
      ) : null}
      {input.actionLinks.reschedulePageUrl ? (
        <a
          className={input.styles.secondaryButton}
          href={input.actionLinks.reschedulePageUrl}
          target="_top"
        >
          Open reschedule link
        </a>
      ) : null}
    </div>
  );
}
