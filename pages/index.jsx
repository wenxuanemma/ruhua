import dynamic from 'next/dynamic';

// Disable SSR — the app uses browser APIs (camera, canvas)
const RuHua = dynamic(() => import('./RuHua'), { ssr: false });

export default function Home() {
  return <RuHua />;
}
