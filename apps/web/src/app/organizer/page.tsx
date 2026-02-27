import OrganizerConsolePageClient from './page.client';
import { resolveApiBaseUrl } from '../../lib/api-base-url';

export default function OrganizerConsolePage() {
  return <OrganizerConsolePageClient apiBaseUrl={resolveApiBaseUrl('organizer console')} />;
}
