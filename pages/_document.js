import { Html, Head, Main, NextScript } from "next/document";

export default function Document({ __NEXT_DATA__ }) {
  // The Chinese painting pages live under /zh; everything else is English.
  const lang = __NEXT_DATA__?.page?.startsWith('/zh') ? 'zh-Hans' : 'en';
  return (
    <Html lang={lang}>
      <Head>
        {/* viewport-fit=cover is required for env(safe-area-inset-*) to
            resolve to real values instead of silently defaulting to 0 --
            without it, the credits balance badge's safe-area positioning
            (see pages/RuHua.jsx) has no real inset to work with, since the
            WebView isn't rendering edge-to-edge in the first place. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Google Search Console ownership check for https://ruhua.vercel.app */}
        <meta name="google-site-verification" content="2Cf7GYcKx9vqraaAnRVBjYV-FJtNETyTnNhjs1aj82s" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
