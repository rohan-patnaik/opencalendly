'use client';

import { type FormEvent, useState } from 'react';

import {
  organizerApi,
  type TeamEventType,
  type TeamMember,
  type TeamSummary,
} from '../../lib/organizer-api';
import type { AuthSession } from '../../lib/auth-session';
import { toNullableString } from './utils';

type OrganizerStyles = Record<string, string>;

export const TeamsPanel = ({
  apiBaseUrl,
  session,
  teams,
  selectedTeamId,
  setSelectedTeamId,
  selectedTeam,
  teamMembers,
  teamEventTypes,
  teamDetailsLoading,
  teamDetailsError,
  refreshTeamDetails,
  refreshOrganizerState,
  isBusy,
  beginBusy,
  endBusy,
  setPanelError,
  setPanelMessage,
  styles,
}: {
  apiBaseUrl: string;
  session: AuthSession | null;
  teams: TeamSummary[];
  selectedTeamId: string;
  setSelectedTeamId: (value: string) => void;
  selectedTeam: TeamSummary | null;
  teamMembers: TeamMember[];
  teamEventTypes: TeamEventType[];
  teamDetailsLoading: boolean;
  teamDetailsError: string | null;
  refreshTeamDetails: (teamId: string) => Promise<void>;
  refreshOrganizerState: () => Promise<void>;
  isBusy: (action: string) => boolean;
  beginBusy: (action: string) => void;
  endBusy: (action: string) => void;
  setPanelError: (message: string | null) => void;
  setPanelMessage: (message: string | null) => void;
  styles: OrganizerStyles;
}) => {
  const [teamCreateForm, setTeamCreateForm] = useState({ name: '', slug: '' });
  const [teamMemberForm, setTeamMemberForm] = useState({
    userId: '',
    role: 'member' as 'owner' | 'member',
  });
  const [teamEventTypeForm, setTeamEventTypeForm] = useState({
    name: '',
    slug: '',
    durationMinutes: '30',
    mode: 'round_robin' as 'round_robin' | 'collective',
    locationType: 'video' as 'video' | 'phone' | 'in_person' | 'custom',
    locationValue: '',
    requiredMemberUserIds: '',
  });

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const action = 'teamCreate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.createTeam(apiBaseUrl, session, {
        name: teamCreateForm.name.trim(),
        slug: teamCreateForm.slug.trim().toLowerCase(),
      });
      setTeamCreateForm({ name: '', slug: '' });
      setPanelMessage('Team created.');
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to create team.');
    } finally {
      endBusy(action);
    }
  };

  const handleAddTeamMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selectedTeamId) {
      return;
    }

    const action = 'teamMemberCreate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await organizerApi.addTeamMember(apiBaseUrl, session, selectedTeamId, {
        userId: teamMemberForm.userId.trim(),
        role: teamMemberForm.role,
      });
      setTeamMemberForm({ userId: '', role: 'member' });
      setPanelMessage('Team member added.');
      await refreshTeamDetails(selectedTeamId);
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to add team member.');
    } finally {
      endBusy(action);
    }
  };

  const handleCreateTeamEventType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selectedTeamId) {
      return;
    }

    const action = 'teamEventTypeCreate';
    beginBusy(action);
    setPanelError(null);
    setPanelMessage(null);

    const requiredMemberUserIds = teamEventTypeForm.requiredMemberUserIds
      .split(',')
      .map((userId) => userId.trim())
      .filter(Boolean);

    try {
      await organizerApi.createTeamEventType(apiBaseUrl, session, {
        teamId: selectedTeamId,
        name: teamEventTypeForm.name.trim(),
        slug: teamEventTypeForm.slug.trim().toLowerCase(),
        durationMinutes: Number.parseInt(teamEventTypeForm.durationMinutes, 10),
        mode: teamEventTypeForm.mode,
        locationType: teamEventTypeForm.locationType,
        locationValue: toNullableString(teamEventTypeForm.locationValue),
        ...(requiredMemberUserIds.length > 0 ? { requiredMemberUserIds } : {}),
      });
      setTeamEventTypeForm({
        name: '',
        slug: '',
        durationMinutes: '30',
        mode: 'round_robin',
        locationType: 'video',
        locationValue: '',
        requiredMemberUserIds: '',
      });
      setPanelMessage('Team event type created.');
      await refreshTeamDetails(selectedTeamId);
      await refreshOrganizerState();
    } catch (caught) {
      setPanelError(caught instanceof Error ? caught.message : 'Unable to create team event type.');
    } finally {
      endBusy(action);
    }
  };

  return (
    <>
      <div className={styles.splitGrid}>
        <form className={styles.form} onSubmit={handleCreateTeam}>
          <h3>Create team</h3>
          <label className={styles.label}>
            Team name
            <input className={styles.input} value={teamCreateForm.name} onChange={(event) => setTeamCreateForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label className={styles.label}>
            Team slug
            <input className={styles.input} value={teamCreateForm.slug} onChange={(event) => setTeamCreateForm((prev) => ({ ...prev, slug: event.target.value }))} required />
          </label>
          <button type="submit" className={styles.primaryButton} disabled={isBusy('teamCreate')}>
            {isBusy('teamCreate') ? 'Creating…' : 'Create team'}
          </button>
        </form>

        <div className={styles.form}>
          <h3>Select team</h3>
          {teams.length === 0 ? (
            <p className={styles.empty}>No teams created yet.</p>
          ) : (
            <>
              <label className={styles.label}>
                Team
                <select className={styles.select} value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({team.slug})
                    </option>
                  ))}
                </select>
              </label>
              <ul>
                {teams.map((team) => (
                  <li key={team.id}>
                    {team.name} - members: {team.memberCount}, team event types: {team.teamEventTypeCount}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {selectedTeam ? (
        <div className={styles.teamPanel}>
          <h3>Team details: {selectedTeam.name}</h3>
          {teamDetailsLoading ? <p>Loading team members and event types…</p> : null}
          {teamDetailsError ? <p className={styles.error}>{teamDetailsError}</p> : null}

          <div className={styles.splitGrid}>
            <form className={styles.form} onSubmit={handleAddTeamMember}>
              <h4>Add member</h4>
              <p className={styles.helperText}>Enter a user UUID. Seed users are created by `npm run db:seed`.</p>
              <label className={styles.label}>
                User ID (UUID)
                <input className={styles.input} value={teamMemberForm.userId} onChange={(event) => setTeamMemberForm((prev) => ({ ...prev, userId: event.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
              </label>
              <label className={styles.label}>
                Role
                <select className={styles.select} value={teamMemberForm.role} onChange={(event) => setTeamMemberForm((prev) => ({ ...prev, role: event.target.value as 'owner' | 'member' }))}>
                  <option value="member">member</option>
                  <option value="owner">owner</option>
                </select>
              </label>
              <button type="submit" className={styles.primaryButton} disabled={isBusy('teamMemberCreate')}>
                {isBusy('teamMemberCreate') ? 'Adding…' : 'Add member'}
              </button>
              {teamMembers.length === 0 ? (
                <p className={styles.empty}>No members found.</p>
              ) : (
                <ul>
                  {teamMembers.map((member) => (
                    <li key={member.id}>
                      {member.user.displayName} ({member.user.email}) - {member.role}
                      <br />
                      <span className={styles.helperText}>{member.userId}</span>
                    </li>
                  ))}
                </ul>
              )}
            </form>

            <form className={styles.form} onSubmit={handleCreateTeamEventType}>
              <h4>Create team event type</h4>
              <label className={styles.label}>
                Name
                <input className={styles.input} value={teamEventTypeForm.name} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label className={styles.label}>
                Slug
                <input className={styles.input} value={teamEventTypeForm.slug} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, slug: event.target.value }))} required />
              </label>
              <label className={styles.label}>
                Duration (minutes)
                <input className={styles.input} type="number" min={5} max={240} value={teamEventTypeForm.durationMinutes} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, durationMinutes: event.target.value }))} required />
              </label>
              <label className={styles.label}>
                Mode
                <select className={styles.select} value={teamEventTypeForm.mode} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, mode: event.target.value as 'round_robin' | 'collective' }))}>
                  <option value="round_robin">round_robin</option>
                  <option value="collective">collective</option>
                </select>
              </label>
              <label className={styles.label}>
                Location type
                <select className={styles.select} value={teamEventTypeForm.locationType} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, locationType: event.target.value as 'video' | 'phone' | 'in_person' | 'custom' }))}>
                  <option value="video">video</option>
                  <option value="phone">phone</option>
                  <option value="in_person">in_person</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <label className={styles.label}>
                Location value (optional)
                <input className={styles.input} value={teamEventTypeForm.locationValue} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, locationValue: event.target.value }))} />
              </label>
              <label className={styles.label}>
                Required member IDs (comma-separated, optional)
                <input className={styles.input} value={teamEventTypeForm.requiredMemberUserIds} onChange={(event) => setTeamEventTypeForm((prev) => ({ ...prev, requiredMemberUserIds: event.target.value }))} placeholder="uuid-1, uuid-2" />
              </label>
              <button type="submit" className={styles.primaryButton} disabled={isBusy('teamEventTypeCreate')}>
                {isBusy('teamEventTypeCreate') ? 'Creating…' : 'Create team event type'}
              </button>
              {teamEventTypes.length === 0 ? (
                <p className={styles.empty}>No team event types configured.</p>
              ) : (
                <div className={styles.listGrid}>
                  {teamEventTypes.map((item) => (
                    <article key={item.id} className={styles.itemCard}>
                      <div className={styles.itemHead}>
                        <strong>{item.eventType.name}</strong>
                        <span className={styles.badge}>{item.mode}</span>
                      </div>
                      <p>
                        {item.eventType.slug} · {item.eventType.durationMinutes} min
                      </p>
                      <p>Required members: {item.requiredMemberUserIds.length}</p>
                    </article>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};
