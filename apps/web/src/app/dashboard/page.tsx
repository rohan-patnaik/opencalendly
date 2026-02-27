import DashboardPageClient from './page.client';
import { resolveApiBaseUrl } from '../../lib/api-base-url';

export default function DashboardPage() {
  return <DashboardPageClient apiBaseUrl={resolveApiBaseUrl('dashboard analytics')} />;
}
