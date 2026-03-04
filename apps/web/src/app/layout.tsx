import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import AppChrome from '../components/app-chrome';
import AuthSessionBridge from '../components/auth-session-bridge';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OpenCalendly',
  description: 'Open-source scheduling platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!clerkPublishableKey) {
    return (
      <html lang="en" data-theme="obsidian-amber" className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <body>
          <main style={{ margin: '3rem auto', maxWidth: 760, padding: '0 1rem' }}>
            <h1>Clerk configuration required</h1>
            <p>
              Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in <code>.env</code> to run
              the web app.
            </p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" data-theme="obsidian-amber" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <AuthSessionBridge />
          <AppChrome>{children}</AppChrome>
        </ClerkProvider>
      </body>
    </html>
  );
}
