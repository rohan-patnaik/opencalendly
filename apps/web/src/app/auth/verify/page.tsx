import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default function VerifyPage() {
  const nextParams = new URLSearchParams({ source: 'legacy-verify' });
  redirect(`/auth/sign-in?${nextParams.toString()}`);
}
