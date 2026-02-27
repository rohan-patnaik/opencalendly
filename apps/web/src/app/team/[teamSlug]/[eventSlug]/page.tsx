import { resolveApiBaseUrl } from '../../../../lib/api-base-url';
import TeamBookingPageClient from './page.client';

type TeamBookingPageProps = {
  params: Promise<{
    teamSlug: string;
    eventSlug: string;
  }>;
};

export default async function TeamBookingPage({ params }: TeamBookingPageProps) {
  const { teamSlug, eventSlug } = await params;

  return (
    <TeamBookingPageClient
      teamSlug={teamSlug}
      eventSlug={eventSlug}
      apiBaseUrl={resolveApiBaseUrl('TeamBookingPage')}
    />
  );
}
