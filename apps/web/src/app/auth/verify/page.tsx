import { redirect } from 'next/navigation';

export default function VerifyPage() {
  redirect('/auth/sign-in?source=legacy-verify');
}
