import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import VerifyPageClient from './page.client';

export default function VerifyPage() {
  return <VerifyPageClient apiBaseUrl={resolveApiBaseUrl('magic-link verification')} />;
}
