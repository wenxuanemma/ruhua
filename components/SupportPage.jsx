// Support / FAQ page (/support and /zh/support), used as the App Store
// "Support URL". Facts here are checked against the app code:
// - free tries: FREE_CREDITS_AMOUNT in pages/api/grant-free-credits.js
// - one credit per portrait, charged only after a successful composite:
//   deductCredit() in pages/api/composite.js
// - credits come back after reinstall on the same device only:
//   lib/deviceStorage.js + pages/api/migrate-credits.js
// - credit pack sizes: CREDIT_PRODUCTS in lib/purchases.js (prices come from
//   the App Store at runtime, so none are listed here)
// - hair combed back and glasses removed: the Seedream prompt in
//   pages/api/generate.js
// Privacy wording follows pages/privacy.jsx; update both together.

import Head from 'next/head';
import Link from 'next/link';
import { SITE_URL, APP_STORE_URL } from '../lib/paintingPages';
import { Nav, Footer } from './PaintingSite';
import s from './PaintingSite.module.css';

const EMAIL = 'ruhua.contact@gmail.com';

const Mail = () => <a href={`mailto:${EMAIL}`}>{EMAIL}</a>;
const Privacy = ({ children }) => <Link href="/privacy">{children}</Link>;

const CONTENT = {
  en: {
    path: '/support',
    otherPath: '/zh/support',
    title: 'RuHua support',
    pageTitle: 'Support and FAQ | RuHua',
    description: 'Help with RuHua: how it works, free tries and credits, what happens to credits when you reinstall, tips for a good selfie, privacy, and how to contact the developer.',
    contactTitle: 'Contact',
    contact: (
      <>
        <p>Email <Mail />. RuHua is made by one person, and that's who reads this inbox.</p>
        <p>If something went wrong, it helps to say which painting and figure you picked, your iPhone or iPad model, and roughly when it happened. A screenshot is even better.</p>
        <p>Refunds for App Store purchases are handled by Apple, at <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>.</p>
      </>
    ),
    faqTitle: 'Questions',
    faq: [
      ['How does it work?', <>
        <p>You take one selfie facing the camera and pick a figure in one of the paintings. RuHua turns your face into a gongbi-style (fine-brush) portrait and puts it in that figure's place. This runs in the cloud.</p>
        <p>The first portrait from a new selfie takes the longest, about 20–30 seconds. After that, putting the same selfie into other paintings or figures is much quicker, because the portrait is kept and reused. Figures shown from the side or at an angle need one extra turned version, and switching between a man's and a woman's figure makes a new portrait.</p>
      </>],
      ['Is it free?', <>
        <p>New users get 3 free portraits, and there's no account to sign up for. After that you buy credits in packs of 5, 20 or 60. Each portrait uses one credit. The app shows the prices in your local currency.</p>
        <p>A credit is only used when a portrait actually comes out. If generation fails, you aren't charged one.</p>
      </>],
      ['I deleted the app or got a new phone. Where are my credits?', <>
        <p>If you delete RuHua and install it again on the same iPhone or iPad, your unused credits come back on their own the next time you open the app. There's no Restore Purchases button because you don't need one for this.</p>
        <p>Credits don't move to a different device. RuHua has no accounts, so there's nothing that links your old phone to your new one. If you lost credits some other way, email me.</p>
      </>],
      ['How do I get a good result?', <>
        <p>Look straight at the camera, in good even light, close enough that your face fills a fair part of the frame. Taking glasses off helps; the portrait is drawn without them anyway.</p>
        <p>Your hairstyle doesn't matter. The portrait has the hair pulled back, and the figure keeps the hairstyle from the painting.</p>
      </>],
      ['What happens to my selfie?', <>
        <p>Your selfie is sent to a third-party AI service, aimlapi.com, to generate the portrait. aimlapi.com retains request inputs (your selfie) and generated outputs for up to 2 months, solely so that results can be retrieved by request ID. Requests to the Seedream model (ByteDance) are processed in China.</p>
        <p>We do not maintain a separate copy of your selfie or generated portraits on our own servers. Your most recent selfie is cached on your device until you take a new one or delete the app.</p>
        <p>The full details are in the <Privacy>privacy policy</Privacy>.</p>
      </>],
      ['Is there an Android version?', <>
        <p>Not yet. RuHua is on iPhone and iPad only.</p>
      </>],
    ],
    paintings: <>The paintings in the app, and who's in them: <Link href="/paintings">see all eleven</Link>.</>,
    button: 'RuHua on the App Store',
  },
  zh: {
    path: '/zh/support',
    otherPath: '/support',
    title: '入画 帮助',
    pageTitle: '帮助与常见问题 | 入画 RuHua',
    description: '入画使用帮助：怎么用、免费次数和点数、重装后点数怎么办、怎么拍出好效果、隐私，以及怎么联系开发者。',
    contactTitle: '联系我',
    contact: (
      <>
        <p>发邮件到 <Mail />。入画是一个人做的，邮件也是我本人看。</p>
        <p>遇到问题的话，最好说一下选的是哪幅画、哪个人物，用的是什么型号的 iPhone 或 iPad，大概什么时候出的问题。有截图更好。</p>
        <p>App Store 购买的退款由苹果处理，请到 <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a> 申请。</p>
      </>
    ),
    faqTitle: '常见问题',
    faq: [
      ['怎么用？', <>
        <p>正对镜头拍一张自拍，再在画里选一个人物。入画会把你的脸画成工笔风格的肖像，放到这个人物的位置上。生成在云端进行。</p>
        <p>新自拍的第一张最慢，大约 20–30 秒。之后用同一张自拍换别的画或人物会快很多，因为肖像会保留下来重复使用。侧脸或半侧脸的人物需要额外生成一个转过角度的版本；在男性和女性人物之间切换，也会重新生成肖像。</p>
      </>],
      ['免费吗？', <>
        <p>新用户有 3 次免费机会，不用注册账号。之后可以买点数，有 5、20、60 点三种。每生成一张用 1 点，价格以应用里显示的当地货币为准。</p>
        <p>只有成功生成才会扣点数，生成失败不扣。</p>
      </>],
      ['删了应用或换了手机，点数还在吗？', <>
        <p>在同一台 iPhone 或 iPad 上删掉再重装，下次打开应用时，没用完的点数会自动回来，不需要点“恢复购买”。</p>
        <p>点数不能转到另一台设备上。入画没有账号系统，所以没办法把旧手机和新手机对应起来。如果是别的情况丢了点数，请发邮件给我。</p>
      </>],
      ['怎么拍效果好？', <>
        <p>正对镜头，光线充足均匀，脸在画面里不要太小。最好摘掉眼镜，生成的肖像本来也不会画眼镜。</p>
        <p>发型无所谓。肖像里头发会梳到后面，人物保留原画里的发型。</p>
      </>],
      ['我的自拍会怎么处理？', <>
        <p>您的自拍图像将被发送至第三方AI服务aimlapi.com，以生成肖像。aimlapi.com会将请求输入（您的自拍）及生成结果保留最长2个月，仅用于通过请求编号调取结果。发送至Seedream模型（字节跳动）的请求在中国境内处理。</p>
        <p>我们不会在自有服务器上另行保留您的自拍或生成肖像的副本。您最近一次的自拍会缓存在设备本地，直到您拍摄新的自拍或删除应用。</p>
        <p>完整说明见<Privacy>隐私政策</Privacy>。</p>
      </>],
      ['有安卓版吗？', <>
        <p>暂时没有，目前只支持 iPhone 和 iPad。</p>
      </>],
    ],
    paintings: <>应用里有哪些画、画中都是谁：<Link href="/zh/paintings">看全部十一幅</Link>。</>,
    button: '在 App Store 下载入画',
  },
};

export default function SupportPage({ lang }) {
  const c = CONTENT[lang];
  const en = lang === 'en';

  return (
    <div className={s.page} lang={en ? 'en' : 'zh-Hans'}>
      <Head>
        <title>{c.pageTitle}</title>
        <meta name="description" content={c.description} />
        <link rel="canonical" href={SITE_URL + c.path} />
        <link rel="alternate" hrefLang="en" href={SITE_URL + '/support'} />
        <link rel="alternate" hrefLang="zh-Hans" href={SITE_URL + '/zh/support'} />
        <link rel="alternate" hrefLang="x-default" href={SITE_URL + '/support'} />
        <meta property="og:title" content={c.pageTitle} />
        <meta property="og:description" content={c.description} />
        <meta property="og:url" content={SITE_URL + c.path} />
        <meta property="og:type" content="website" />
      </Head>
      <div className={s.inner}>
        <Nav lang={lang} otherPath={c.otherPath} />
        <header className={s.header}>
          <h1>{c.title}</h1>
        </header>
        <div className={s.content}>
          <h2>{c.contactTitle}</h2>
          {c.contact}

          <h2>{c.faqTitle}</h2>
          {c.faq.map(([q, a]) => (
            <section key={q}>
              <h3>{q}</h3>
              {a}
            </section>
          ))}

          <p className={s.small}>{c.paintings}</p>
          <p><a className={s.button} href={APP_STORE_URL}>{c.button}</a></p>
        </div>
        <Footer />
      </div>
    </div>
  );
}
