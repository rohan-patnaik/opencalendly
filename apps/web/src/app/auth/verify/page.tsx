import { redirect } from 'next/navigation';

type VerifyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const firstParam = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const runtime = 'edge';

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextParams = new URLSearchParams({ source: 'legacy-verify' });
  const token = firstParam(resolvedSearchParams?.token)?.trim();
  if (token) {
    nextParams.set('token', token);
  }

  redirect(`/auth/sign-in?${nextParams.toString()}`);
}
