import { Suspense } from 'react';

import CalendarConnectCallback from '../../../../../components/calendar-connect-callback';
import { resolveApiBaseUrl } from '../../../../../lib/api-base-url';

export default function MicrosoftCalendarConnectCallbackPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <CalendarConnectCallback
        provider="microsoft"
        apiBaseUrl={resolveApiBaseUrl('microsoft calendar oauth')}
      />
    </Suspense>
  );
}

function Fallback() {
  return <main style={{ margin: '3rem auto', maxWidth: 720, padding: '0 1rem' }}>Preparing callback…</main>;
}
