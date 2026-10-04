import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = {
  title: 'Sitecheck — Know what ships.',
  description:
    'Transparent website audits for developers. SEO, accessibility, technical health, and structure.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
