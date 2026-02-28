import { Suspense } from 'react';

import CalendarConnectCallback from '../../../../../components/calendar-connect-callback';
import CalendarCallbackFallback from '../../callback-fallback';
import { resolveApiBaseUrl } from '../../../../../lib/api-base-url';

export default function GoogleCalendarConnectCallbackPage() {
  return (
    <Suspense fallback={<CalendarCallbackFallback />}>
      <CalendarConnectCallback
        provider="google"
        apiBaseUrl={resolveApiBaseUrl('google calendar oauth')}
      />
    </Suspense>
  );
}
