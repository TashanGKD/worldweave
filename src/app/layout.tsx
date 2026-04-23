import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
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
  authors: [{ name: '世界脉络', url: 'https://travel.coze.site' }],
  generator: '世界脉络',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: '世界脉络',
    description: '信源标点、连续观察与关联推演。',
    url: 'https://travel.coze.site',
    siteName: '世界脉络',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: '扣子编程 - 你的 AI 工程师',
    //   },
    // ],
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
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
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
