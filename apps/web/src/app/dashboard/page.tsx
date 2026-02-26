import DashboardPageClient from './page.client';

const resolveApiBaseUrl = (): string => {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    'http://127.0.0.1:8787'
  );
};

export default function DashboardPage() {
  return <DashboardPageClient apiBaseUrl={resolveApiBaseUrl()} />;
}
