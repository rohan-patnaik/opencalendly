import { resolveApiBaseUrl } from '../../../lib/api-base-url';
import EmbedPlaygroundPageClient from './page.client';

export default function EmbedPlaygroundPage() {
  return <EmbedPlaygroundPageClient apiBaseUrl={resolveApiBaseUrl('EmbedPlaygroundPage')} />;
}
