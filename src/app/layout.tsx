import './globals.css';
import type { Metadata, Viewport } from 'next';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Cofrin',
  description: 'Seu dinheiro, organizado.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#111110' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">Cofrin</div>
            <Nav />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
