import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* viewport-fit=cover is required for env(safe-area-inset-*) to
            resolve to real values instead of silently defaulting to 0 --
            without it, the credits balance badge's safe-area positioning
            (see pages/RuHua.jsx) has no real inset to work with, since the
            WebView isn't rendering edge-to-edge in the first place. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
