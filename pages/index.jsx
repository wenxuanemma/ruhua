import dynamic from 'next/dynamic';
import Head from 'next/head';

// Disable SSR — the app uses browser APIs (camera, canvas)
const RuHua = dynamic(() => import('./RuHua'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>RuHua 入画 – put your face into classical Chinese paintings</title>
        <meta name="description" content="RuHua is an iOS app that puts your face into classical Chinese paintings like Night Revels of Han Xizai and Li Song's Skeleton Puppet Show." />
      </Head>
      <RuHua />
    </>
  );
}
