import CalendarConnectCallback from '../../../../../components/calendar-connect-callback';
import { resolveApiBaseUrl } from '../../../../../lib/api-base-url';

export default function MicrosoftCalendarConnectCallbackPage() {
  return <CalendarConnectCallback provider="microsoft" apiBaseUrl={resolveApiBaseUrl('microsoft calendar oauth')} />;
}
