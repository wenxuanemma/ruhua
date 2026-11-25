import dynamic from 'next/dynamic';
import Head from 'next/head';
import { SITE_URL, OG_IMAGE, APP_JSON_LD } from '../lib/paintingPages';

// Disable SSR — the app uses browser APIs (camera, canvas)
const RuHua = dynamic(() => import('./RuHua'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>RuHua 入画 – put your face into classical Chinese paintings</title>
        <meta name="description" content="RuHua turns one selfie into a gongbi portrait inside classical Chinese paintings: 15 paintings, 55 characters, Tang to Qing. Free to try on iPhone and iPad." />
        <link rel="canonical" href={SITE_URL + '/'} />
        <meta property="og:title" content="RuHua 入画 – put your face into classical Chinese paintings" />
        <meta property="og:description" content="RuHua turns one selfie into a gongbi portrait inside classical Chinese paintings: 15 paintings, 55 characters, Tang to Qing. Free to try on iPhone and iPad." />
        <meta property="og:url" content={SITE_URL + '/'} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }} />
      </Head>
      <RuHua />
    </>
  );
}
