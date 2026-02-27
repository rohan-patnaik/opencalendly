import CalendarConnectCallback from '../../../../../components/calendar-connect-callback';
import { resolveApiBaseUrl } from '../../../../../lib/api-base-url';

export default function GoogleCalendarConnectCallbackPage() {
  return <CalendarConnectCallback provider="google" apiBaseUrl={resolveApiBaseUrl('google calendar oauth')} />;
}
