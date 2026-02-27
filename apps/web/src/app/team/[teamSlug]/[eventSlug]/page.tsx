import TeamBookingPageClient from './page.client';

type TeamBookingPageProps = {
  params: Promise<{
    teamSlug: string;
    eventSlug: string;
  }>;
};

const resolveApiBaseUrl = (): string => {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    'http://127.0.0.1:8787'
  );
};

export default async function TeamBookingPage({ params }: TeamBookingPageProps) {
  const { teamSlug, eventSlug } = await params;

  return (
    <TeamBookingPageClient
      teamSlug={teamSlug}
      eventSlug={eventSlug}
      apiBaseUrl={resolveApiBaseUrl()}
    />
  );
}
