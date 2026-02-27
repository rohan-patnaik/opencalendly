import DashboardPageClient from './page.client';

const resolveApiBaseUrl = (): string => {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || process.env.API_BASE_URL?.trim();
  if (!configured) {
    throw new Error('Missing NEXT_PUBLIC_API_BASE_URL or API_BASE_URL for dashboard analytics.');
  }
  return configured.replace(/\/$/, '');
};

export default function DashboardPage() {
  return <DashboardPageClient apiBaseUrl={resolveApiBaseUrl()} />;
}
