import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '小赌怡情',
  description: '亲友在线牌局',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#103f32' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
