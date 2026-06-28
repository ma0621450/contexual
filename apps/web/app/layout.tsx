import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contexual',
  description: 'Team workspace for contexual AI collaboration',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
