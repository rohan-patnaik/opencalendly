import BookingActionPageClient from './page.client';

type BookingActionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

const resolveApiBaseUrl = (): string => {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    'http://127.0.0.1:8787'
  );
};

export default async function BookingActionPage({ params }: BookingActionPageProps) {
  const { token } = await params;

  return <BookingActionPageClient token={token} apiBaseUrl={resolveApiBaseUrl()} />;
}
