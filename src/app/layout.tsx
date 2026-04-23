import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '世界脉络',
    template: '%s | 世界脉络',
  },
  description: '信源标点、连续观察与关联推演。',
  keywords: [
    '世界脉络',
    '世界信源',
    '多智能体',
    '演绎',
    '推测',
    '地图标点',
    '世界观察',
  ],
  authors: [{ name: '世界脉络', url: 'https://github.com/TashanGKD/worldweave' }],
  generator: '世界脉络',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: '世界脉络',
    description: '信源标点、连续观察与关联推演。',
    url: 'https://github.com/TashanGKD/worldweave',
    siteName: '世界脉络',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {children}
      </body>
    </html>
  );
}
