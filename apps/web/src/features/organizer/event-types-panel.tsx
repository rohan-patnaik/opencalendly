'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { organizerApi, type OrganizerEventType } from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import { buildDefaultEventTypeForm, toNullableString } from './utils';

type OrganizerStyles = Record<string, string>;

export const EventTypesPanel = ({
  apiBaseUrl,
  session,
  eventTypes,
  isBusy,
  beginBusy,
  endBusy,
  refreshOrganizerState,
  setPanelError,
  setPanelMessage,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  eventTypes: OrganizerEventType[];
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  refreshOrganizerState: () => Promise<void>;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [createForm, setCreateForm] = useState(buildDefaultEventTypeForm);
  const [updateForm, setUpdateForm] = useState(buildDefaultEventTypeForm);
  const [updateId, setUpdateId] = useState('');

  useEffect(() => {
    if (!updateId) {
      const first = eventTypes[0];
      if (first) {
        setUpdateId(first.id);
        setUpdateForm({
          name: first.name,
          slug: first.slug,
          durationMinutes: String(first.durationMinutes),
          locationType: first.locationType,
          locationValue: first.locationValue ?? '',
          isActive: first.isActive,
        });
      }
      return;
    }

    if (eventTypes.some((eventType) => eventType.id === updateId)) {
      return;
    }

    const first = eventTypes[0];
    if (!first) {
      return;
    }
    setUpdateId(first.id);
    setUpdateForm({
      name: first.name,
      slug: first.slug,
      durationMinutes: String(first.durationMinutes),
      locationType: first.locationType,
      locationValue: first.locationValue ?? '',
      isActive: first.isActive,
    });
  }, [eventTypes, updateId]);

  const handleCreateEventType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const action = 'eventTypeCreate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.createEventType(apiBaseUrl, session, {
        name: createForm.name.trim(),
        slug: createForm.slug.trim().toLowerCase(),
        durationMinutes: Number.parseInt(createForm.durationMinutes, 10),
        locationType: createForm.locationType,
        locationValue: toNullableString(createForm.locationValue),
      });
      setCreateForm(buildDefaultEventTypeForm());
      setPanelMessage('Event type created.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to create event type.');
    } finally {
      endBusy(action);
    }
  };

  const handleUpdateEventType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !updateId) {
      return;
    }

    const action = 'eventTypeUpdate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.updateEventType(apiBaseUrl, session, updateId, {
        name: updateForm.name.trim(),
        slug: updateForm.slug.trim().toLowerCase(),
        durationMinutes: Number.parseInt(updateForm.durationMinutes, 10),
        locationType: updateForm.locationType,
        locationValue: toNullableString(updateForm.locationValue),
        isActive: updateForm.isActive,
      });
      setPanelMessage('Event type updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update event type.');
    } finally {
      endBusy(action);
    }
  };

  const handleToggleEventTypeActive = async (eventTypeId: string, isActive: boolean) => {
    if (!session) {
      return;
    }

    const action = `eventTypeToggle:${eventTypeId}`;
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.updateEventType(apiBaseUrl, session, eventTypeId, {
        isActive: !isActive,
      });
      setPanelMessage('Event type status updated.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to update event type status.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <div className={styles.splitGrid}>
      <div className={styles.form}>
        <h3>Existing event types</h3>
        {eventTypes.length === 0 ? (
          <p className={styles.empty}>No event types found yet.</p>
        ) : (
          <div className={styles.listGrid}>
            {eventTypes.map((eventType) => (
              <article key={eventType.id} className={styles.itemCard}>
                <div className={styles.itemHead}>
                  <strong>{eventType.name}</strong>
                  <span className={styles.badge}>{eventType.slug}</span>
                </div>
                <p>
                  {eventType.durationMinutes} min · {eventType.locationType}
                </p>
                <p>Status: {eventType.isActive ? 'Active' : 'Inactive'}</p>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => void handleToggleEventTypeActive(eventType.id, eventType.isActive)}
                  disabled={isBusy(`eventTypeToggle:${eventType.id}`)}
                >
                  {isBusy(`eventTypeToggle:${eventType.id}`)
                    ? 'Saving…'
                    : eventType.isActive
                      ? 'Deactivate'
                      : 'Activate'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <form className={styles.form} onSubmit={handleCreateEventType}>
        <h3>Create event type</h3>
        <label className={styles.label}>
          Name
          <input className={styles.input} value={createForm.name} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} required />
        </label>
        <label className={styles.label}>
          Slug
          <input className={styles.input} value={createForm.slug} onChange={(event) => setCreateForm((prev) => ({ ...prev, slug: event.target.value }))} placeholder="intro-call" required />
        </label>
        <label className={styles.label}>
          Duration (minutes)
          <input className={styles.input} type="number" min={5} max={240} value={createForm.durationMinutes} onChange={(event) => setCreateForm((prev) => ({ ...prev, durationMinutes: event.target.value }))} required />
        </label>
        <label className={styles.label}>
          Location type
          <select className={styles.select} value={createForm.locationType} onChange={(event) => setCreateForm((prev) => ({ ...prev, locationType: event.target.value as OrganizerEventType['locationType'] }))}>
            <option value="video">video</option>
            <option value="phone">phone</option>
            <option value="in_person">in_person</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label className={styles.label}>
          Location value (optional)
          <input className={styles.input} value={createForm.locationValue} onChange={(event) => setCreateForm((prev) => ({ ...prev, locationValue: event.target.value }))} placeholder="https://meet.example.com/room" />
        </label>
        <button type="submit" className={styles.primaryButton} disabled={isBusy('eventTypeCreate')}>
          {isBusy('eventTypeCreate') ? 'Creating…' : 'Create event type'}
        </button>
      </form>

      <form className={styles.form} onSubmit={handleUpdateEventType}>
        <h3>Edit event type</h3>
        <label className={styles.label}>
          Event type
          <select
            className={styles.select}
            value={updateId}
            onChange={(event) => {
              const nextId = event.target.value;
              setUpdateId(nextId);
              const selected = eventTypes.find((eventType) => eventType.id === nextId);
              if (!selected) {
                return;
              }
              setUpdateForm({
                name: selected.name,
                slug: selected.slug,
                durationMinutes: String(selected.durationMinutes),
                locationType: selected.locationType,
                locationValue: selected.locationValue ?? '',
                isActive: selected.isActive,
              });
            }}
            required
          >
            {eventTypes.map((eventType) => (
              <option key={eventType.id} value={eventType.id}>
                {eventType.name} ({eventType.slug})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Name
          <input className={styles.input} value={updateForm.name} onChange={(event) => setUpdateForm((prev) => ({ ...prev, name: event.target.value }))} required />
        </label>
        <label className={styles.label}>
          Slug
          <input className={styles.input} value={updateForm.slug} onChange={(event) => setUpdateForm((prev) => ({ ...prev, slug: event.target.value }))} required />
        </label>
        <label className={styles.label}>
          Duration (minutes)
          <input className={styles.input} type="number" min={5} max={240} value={updateForm.durationMinutes} onChange={(event) => setUpdateForm((prev) => ({ ...prev, durationMinutes: event.target.value }))} required />
        </label>
        <label className={styles.label}>
          Location type
          <select className={styles.select} value={updateForm.locationType} onChange={(event) => setUpdateForm((prev) => ({ ...prev, locationType: event.target.value as OrganizerEventType['locationType'] }))}>
            <option value="video">video</option>
            <option value="phone">phone</option>
            <option value="in_person">in_person</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label className={styles.label}>
          Location value (optional)
          <input className={styles.input} value={updateForm.locationValue} onChange={(event) => setUpdateForm((prev) => ({ ...prev, locationValue: event.target.value }))} />
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={updateForm.isActive} onChange={(event) => setUpdateForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
          Active
        </label>
        <button type="submit" className={styles.primaryButton} disabled={isBusy('eventTypeUpdate')}>
          {isBusy('eventTypeUpdate') ? 'Saving…' : 'Save event type'}
        </button>
      </form>
    </div>
  );
};
