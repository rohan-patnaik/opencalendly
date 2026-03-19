import OnboardingPageClient from './page.client';
import { resolveApiBaseUrl } from '../../lib/api-base-url';

export default function OnboardingPage() {
  return <OnboardingPageClient apiBaseUrl={resolveApiBaseUrl('onboarding')} />;
}
