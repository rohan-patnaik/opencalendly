import DashboardPageClient from './page.client';

const resolveApiBaseUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || process.env.API_BASE_URL?.trim() || '';
};

export default function DashboardPage() {
  return <DashboardPageClient apiBaseUrl={resolveApiBaseUrl()} />;
}
