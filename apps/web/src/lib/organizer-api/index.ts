export * from './types';

import { organizerAvailabilityApi } from './availability';
import { organizerCalendarApi } from './calendar';
import { organizerEventTypesApi } from './event-types';
import { organizerTeamsApi } from './teams';
import { organizerWebhooksApi } from './webhooks';

export const organizerApi = {
  ...organizerEventTypesApi,
  ...organizerAvailabilityApi,
  ...organizerTeamsApi,
  ...organizerWebhooksApi,
  ...organizerCalendarApi,
};
