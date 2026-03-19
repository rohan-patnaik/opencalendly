import OrganizerConsolePageClient from '../page.client';
import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import { organizerSections, type OrganizerSectionId } from '../../../features/organizer/utils';

const organizerSectionIds = new Set<string>(organizerSections.map((section) => section.id));

export default async function OrganizerSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const activeSection: OrganizerSectionId = organizerSectionIds.has(section) ? (section as OrganizerSectionId) : 'event-types';

  return (
    <OrganizerConsolePageClient
      apiBaseUrl={resolveApiBaseUrl('organizer console')}
      activeSection={activeSection}
    />
  );
}
