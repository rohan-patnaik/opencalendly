import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import BookingPageClient from './page.client';

export const runtime = 'edge';

type BookingPageProps = {
  params: Promise<{
    username: string;
    eventSlug: string;
  }>;
};

export default async function BookingPage({ params }: BookingPageProps) {
  const { username, eventSlug } = await params;

  return (
    <BookingPageClient
      username={username}
      eventSlug={eventSlug}
      apiBaseUrl={resolveApiBaseUrl('BookingPage')}
    />
  );
}
