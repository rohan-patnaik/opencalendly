import { resolveApiBaseUrl } from '../../../../lib/api-base-url';
import BookingActionPageClient from './page.client';

export const runtime = 'edge';

type BookingActionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function BookingActionPage({ params }: BookingActionPageProps) {
  const { token } = await params;

  return <BookingActionPageClient token={token} apiBaseUrl={resolveApiBaseUrl('BookingActionPage')} />;
}
