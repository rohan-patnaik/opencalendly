import { redirect } from 'next/navigation';

import OrganizerConsolePageClient from '../page.client';
import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import { organizerSections, type OrganizerSectionId } from '../../../features/organizer/utils';

export const runtime = 'edge';

const organizerSectionIds = new Set<string>(organizerSections.map((section) => section.id));

export default async function OrganizerSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!organizerSectionIds.has(section)) {
    redirect('/organizer');
  }

  const activeSection = section as OrganizerSectionId;

  return (
    <OrganizerConsolePageClient
      apiBaseUrl={resolveApiBaseUrl('organizer console')}
      activeSection={activeSection}
    />
  );
}
