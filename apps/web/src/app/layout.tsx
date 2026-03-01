import type { Metadata } from 'next';
import './globals.css';
import AppChrome from '../components/app-chrome';

export const metadata: Metadata = {
  title: 'OpenCalendly',
  description: 'Open-source scheduling platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
