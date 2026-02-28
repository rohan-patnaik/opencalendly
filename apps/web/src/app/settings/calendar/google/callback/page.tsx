import { Suspense } from 'react';

import CalendarConnectCallback from '../../../../../components/calendar-connect-callback';
import { resolveApiBaseUrl } from '../../../../../lib/api-base-url';

export default function GoogleCalendarConnectCallbackPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <CalendarConnectCallback
        provider="google"
        apiBaseUrl={resolveApiBaseUrl('google calendar oauth')}
      />
    </Suspense>
  );
}

function Fallback() {
  return <main style={{ margin: '3rem auto', maxWidth: 720, padding: '0 1rem' }}>Preparing callback…</main>;
}
