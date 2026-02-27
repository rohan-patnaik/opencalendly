import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import SignInPageClient from './page.client';

export default function SignInPage() {
  return <SignInPageClient apiBaseUrl={resolveApiBaseUrl('magic-link sign-in')} />;
}
