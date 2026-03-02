import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import AppChrome from '../components/app-chrome';

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
  return (
    <html lang="en" data-theme="obsidian-amber" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body style={{ fontFamily: 'var(--font-inter)' }}>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
