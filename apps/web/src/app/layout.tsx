import type { Metadata } from 'next';
import './globals.css';
import AppChrome from '../components/app-chrome';

export const metadata: Metadata = {
  title: 'OpenCalendly',
  description: 'Open-source scheduling platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var key='opencalendly.theme';var pref=localStorage.getItem(key)||'system';var resolved=pref==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):pref;document.documentElement.dataset.theme=resolved;}catch(_e){}})();",
          }}
        />
      </head>
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
