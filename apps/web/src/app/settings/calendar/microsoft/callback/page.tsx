import { Suspense } from 'react';

import CalendarConnectCallback from '../../../../../components/calendar-connect-callback';
import CalendarCallbackFallback from '../../callback-fallback';
import { resolveApiBaseUrl } from '../../../../../lib/api-base-url';

export default function MicrosoftCalendarConnectCallbackPage() {
  return (
    <Suspense fallback={<CalendarCallbackFallback />}>
      <CalendarConnectCallback
        provider="microsoft"
        apiBaseUrl={resolveApiBaseUrl('microsoft calendar oauth')}
      />
    </Suspense>
  );
}
