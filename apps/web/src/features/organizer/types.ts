import type {
  AvailabilityOverride,
  AvailabilityRule,
  CalendarProviderStatus,
  NotificationRule,
  OrganizerEventType,
  OrganizerWebhook,
  TeamEventType,
  TeamMember,
  TeamSummary,
  TimeOffBlock,
  WritebackStatus,
} from '../../lib/organizer-api';

export type OrganizerConsoleUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  timezone: string;
};

export type AuthMeResponse = {
  ok: boolean;
  user: OrganizerConsoleUser;
};

export type OrganizerSectionsState = {
  eventTypes: OrganizerEventType[];
  availabilityRules: AvailabilityRule[];
  availabilityOverrides: AvailabilityOverride[];
  timeOffBlocks: TimeOffBlock[];
  teams: TeamSummary[];
  webhooks: OrganizerWebhook[];
  calendarStatuses: CalendarProviderStatus[];
  writebackStatus: WritebackStatus | null;
};

export type TeamDetailsState = {
  teamMembers: TeamMember[];
  teamEventTypes: TeamEventType[];
  loading: boolean;
  error: string | null;
};

export type NotificationRulesState = {
  eventTypeId: string;
  rules: NotificationRule[];
  loading: boolean;
  error: string | null;
};
