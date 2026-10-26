// Content for the public painting pages (/paintings/<slug> and
// /zh/paintings/<slug>). Names, dynasties and figure descriptions come from
// lib/paintings.js, the same data the app uses; this file adds the URL slug,
// a short factual intro and where each painting is held.
//
// Keep it factual. Where the app's dating and a museum's dating differ (some
// of these are later copies of Tang compositions), say so on the page.

import { PAINTINGS } from './paintings';

export const SITE_URL = 'https://ruhua.vercel.app';
export const APP_STORE_URL = 'https://apps.apple.com/us/app/id6788152543';

const PAGES = {
  hanxizai: {
    slug: 'night-revels-of-han-xizai',
    artistEn: 'Attributed to Gu Hongzhong', artistZh: '传顾闳中',
    width: 1547, height: 1200,
    museumEn: 'Palace Museum, Beijing',
    museumZh: '北京故宫博物院',
    introEn: [
      'The Night Revels of Han Xizai is a long handscroll in ink and color on silk, credited to Gu Hongzhong, a court painter of the Southern Tang kingdom in the 10th century. The scroll that survives today is generally thought to be a Song dynasty copy of his work.',
      'The story told about it since the Song dynasty goes like this: Han Xizai (902–970) was a senior official whom the last Southern Tang ruler, Li Yu, wanted to appoint as chief minister. Han spent his nights throwing parties instead. Li Yu sent Gu Hongzhong to attend one and paint what he saw.',
      'The scroll runs through five scenes divided by screens: a pipa recital, a dance where Han himself beats the drum, a break where he rests, a wind ensemble, and guests leaving. The figures in RuHua come from the opening scene, the pipa recital.',
    ],
    introZh: [
      '《韩熙载夜宴图》是绢本设色长卷，传为五代南唐画院画家顾闳中所作。现存的这一卷，一般认为是宋代摹本。',
      '自宋代起流传的说法是：南唐后主李煜想任用韩熙载（902–970）为相，韩熙载却终日在家中夜宴。李煜便派顾闳中前去赴宴，把所见画了下来。',
      '全卷以屏风隔出五段：听乐、观舞、歇息、清吹、送别。观舞一段里，韩熙载亲自击鼓。入画里的人物取自第一段“听乐”，也就是琵琶演奏那一幕。',
    ],
  },
  gongle: {
    slug: 'court-ladies-making-music',
    width: 4000, height: 2802,
    museumEn: 'National Palace Museum, Taipei',
    museumZh: '台北故宫博物院',
    introEn: [
      'Court Ladies Making Music (Gongle tu) is a hanging scroll in ink and color on silk by an unknown Tang dynasty painter, usually dated to the 9th century. It has no signature; the style is close to court-lady painters like Zhang Xuan and Zhou Fang.',
      'Ten women sit around a large table. Some drink from bowls (whether it is tea or wine is still argued about), and four of them play the pipa, guzheng, sheng and a reed pipe. Two attendants stand nearby, one of them keeping time with wooden clappers. There is even a small dog asleep under the table.',
    ],
    introZh: [
      '《宫乐图》为绢本设色立轴，唐代佚名画家所作，一般定为九世纪。画上没有作者款识，风格接近张萱、周昉一路的仕女画。',
      '十位宫中女子围坐在一张大案旁，有人捧碗饮啜（喝的是茶还是酒，至今仍有争论），有四人分别奏琵琶、古筝、笙与胡笳。旁边站着两名侍女，其中一人执拍板击节。案下还卧着一只小狗。',
    ],
  },
  daolian: {
    slug: 'court-ladies-preparing-silk',
    artistEn: 'After Zhang Xuan; copy attributed to Emperor Huizong', artistZh: '张萱原作，传宋徽宗摹',
    width: 6819, height: 1500,
    museumEn: 'Museum of Fine Arts, Boston',
    museumZh: '美国波士顿美术馆',
    introEn: [
      'Court Ladies Preparing Newly Woven Silk (Daolian tu) is a handscroll in ink and color on silk. The original was painted by Zhang Xuan, a Tang court painter of the 8th century, and is lost. The version that survives is a Song dynasty copy traditionally attributed to Emperor Huizong.',
      'It shows the steps of finishing a bolt of silk in three groups: women pounding the silk with long pestles, women sewing and working the thread, and women stretching the cloth and ironing it with a pan of hot coals. A small girl ducks underneath the silk as it is pulled tight.',
    ],
    introZh: [
      '《捣练图》为绢本设色长卷。原作出自唐代宫廷画家张萱之手，已经失传；传世的这一卷是宋代摹本，传为宋徽宗所摹。',
      '画面分三组，表现新织的绢帛加工的过程：执杵捣练、理线缝制、抻绢熨烫。熨烫用的是盛着炭火的熨斗。绢被拉紧时，一个小女孩正从下面钻过去。',
    ],
  },
  yinger: {
    slug: 'palace-ladies-with-children',
    dateEn: 'Tang style · this scroll c. 11th century (Northern Song)', dateZh: '唐代样式 · 此卷约11世纪（北宋）',
    width: 4000, height: 2276,
    museumEn: 'The Metropolitan Museum of Art, New York',
    museumZh: '美国大都会艺术博物馆',
    introEn: [
      'This handscroll is catalogued by The Met as Palace Ladies Bathing Children. It was once attributed to Zhou Fang, the Tang painter best known for court ladies, but the museum now lists the artist as unidentified and dates the scroll to around the 11th century, most likely a Northern Song copy of a Tang-style composition. RuHua groups it with its Tang paintings because of that style.',
      'Women of the inner palace look after small children: one carries a child on her back, others watch toddlers walk and crawl. The figures are set against a blank background, which is typical of Tang court-lady scenes. The Met has released the image into the public domain.',
    ],
    introZh: [
      '这卷画在大都会艺术博物馆的著录名为《戏婴图》（Palace Ladies Bathing Children）。旧传为唐代仕女画家周昉所作，但博物馆现将作者列为佚名，年代定在约十一世纪，大概是北宋时依唐代样式摹绘的。入画因其风格把它归在唐代画作中。',
      '画中是内廷女子照看幼儿的情景：有人背着孩子，有人看着孩子学步、爬行。人物之外不画背景，这是唐代仕女画常见的处理。大都会已将该图像以公有领域方式开放。',
    ],
  },
  tiaoqin: {
    slug: 'ladies-tuning-the-lute',
    artistEn: 'After Zhou Fang', artistZh: '依周昉画稿',
    dateEn: 'Tang composition · this version 12th century', dateZh: '唐代画稿 · 此本12世纪',
    width: 3934, height: 1500,
    museumEn: 'Nelson-Atkins Museum of Art, Kansas City',
    museumZh: '美国纳尔逊-阿特金斯艺术博物馆',
    introEn: [
      'Ladies Tuning the Lute and Sipping Tea (Tiaoqin chuoming tu) is a handscroll in ink and color on silk, painted after the Tang artist Zhou Fang. The Nelson-Atkins, which owns it, catalogues it as Palace Ladies Tuning the Lute and dates this version to the 12th century.',
      'Three women sit in a garden with two maids standing by. One tunes a qin, the seven-string zither, while another sits back and sips tea. There is almost nothing else in the picture, which is part of its point: a slow, quiet afternoon with nothing to do.',
    ],
    introZh: [
      '《调琴啜茗图》为绢本设色长卷，依唐代画家周昉的画稿所作。藏家纳尔逊-阿特金斯艺术博物馆将其著录为 Palace Ladies Tuning the Lute，并把这一本的年代定在十二世纪。',
      '园中坐着三位女子，旁边站着两名侍女。一人在调琴弦，一人倚坐着喝茶。画面几乎再无别物，要表现的正是那种无所事事的、慢悠悠的午后。',
    ],
  },
  huishan: {
    slug: 'court-ladies-with-fans',
    artistEn: 'Attributed to Zhou Fang', artistZh: '传周昉',
    width: 8695, height: 1500,
    museumEn: 'Palace Museum, Beijing',
    museumZh: '北京故宫博物院',
    introEn: [
      'Court Ladies Waving Fans (Huishan shinü tu) is a handscroll in ink and color on silk attributed to Zhou Fang, who painted in the late 8th century and is the name most closely tied to Tang paintings of court women.',
      'More than a dozen women pass a summer day in the palace: resting with round fans, carrying a vase, working at an embroidery frame, sitting idle. They are richly dressed and look bored or a little sad, and that mood is what the painting is usually remembered for.',
    ],
    introZh: [
      '《挥扇仕女图》为绢本设色长卷，传为周昉所作。周昉活跃于八世纪后期，是与唐代仕女画联系最紧密的名字。',
      '十几位宫中女子在夏日里打发时光：执团扇歇息，捧瓶走过，在绣架前做活，或者只是坐着发呆。她们衣饰华丽，神情却多有倦意和愁绪，这幅画最常被人提起的也正是这种气氛。',
    ],
  },
  mingdaidihou_taizu: {
    slug: 'emperor-taizu-and-empress-ma',
    width: 1500, height: 1016,
    museumEn: 'National Palace Museum, Taipei',
    museumZh: '台北故宫博物院',
    introEn: [
      'These two portraits come from an album of half-length portraits of Ming emperors and empresses painted by court artists. In the Qing dynasty the imperial portraits of earlier dynasties were kept in the Nanxun Hall (Nanxundian) of the Forbidden City; the collection is now in Taipei. RuHua shows the emperor\'s and empress\'s portraits side by side.',
      'Zhu Yuanzhang (1328–1398) grew up poor, lost most of his family to famine and plague, and spent time as a monk before joining the rebellions against the Mongol Yuan dynasty. He founded the Ming in 1368 and ruled as the Hongwu Emperor. Empress Ma (1332–1382) was his wife from his rebel days and is remembered for restraining his harsher instincts.',
    ],
    introZh: [
      '这两幅出自明代宫廷画师所绘的《明代帝后半身像》册。清代时，历代帝后像收藏在紫禁城南薰殿，这批画像今藏台北故宫。入画里把帝、后两幅并排展示。',
      '朱元璋（1328–1398）出身贫苦，家人多死于饥荒和瘟疫，他做过和尚，后投身反元义军。1368年建立明朝，年号洪武。马皇后（1332–1382）是他起兵时的结发妻子，史书称她常劝阻太祖的严苛之举。',
    ],
  },
  mingdaidihou_xuanzong: {
    slug: 'emperor-xuanzong-and-empress-sun',
    width: 1500, height: 1016,
    museumEn: 'National Palace Museum, Taipei',
    museumZh: '台北故宫博物院',
    introEn: [
      'From the same album of Ming imperial half-length portraits, once kept in the Nanxun Hall of the Forbidden City and now in Taipei. RuHua shows the two portraits side by side.',
      'Zhu Zhanji (1399–1435) ruled as the Xuande Emperor from 1425. His reign and his father\'s are remembered together as the "Ren–Xuan" period, a stretch of relative peace. He was also a capable painter, and some of his own paintings survive. Empress Sun became empress in 1428, after his first empress was set aside.',
    ],
    introZh: [
      '同样出自原藏紫禁城南薰殿、今藏台北故宫的《明代帝后半身像》册。入画里把两幅并排展示。',
      '朱瞻基（1399–1435）1425年即位，年号宣德。他与父亲明仁宗在位的时期合称“仁宣之治”，是明代较为安定的一段。他本人善画，至今仍有作品传世。孙皇后在1428年原配胡皇后被废之后册立为后。',
    ],
    figures: {
      empress: {
        en: 'Empress Sun, the Xuande Emperor\'s favorite, made empress in 1428. She outlived him by decades and was a powerful figure at court as empress dowager.',
        zh: '宣宗宠爱的孙皇后，1428年册立。宣宗去世后她又活了二十多年，以皇太后身份在宫中颇有分量。',
      },
    },
  },
  mingdaidihou_xiaozong: {
    slug: 'emperor-xiaozong-and-empress-zhang',
    width: 1500, height: 1016,
    museumEn: 'National Palace Museum, Taipei',
    museumZh: '台北故宫博物院',
    introEn: [
      'From the same album of Ming imperial half-length portraits, once kept in the Nanxun Hall of the Forbidden City and now in Taipei. RuHua shows the two portraits side by side.',
      'Zhu Youtang (1470–1505) ruled as the Hongzhi Emperor from 1487. Historians generally rate him as one of the more conscientious Ming rulers, and his reign is often called the Hongzhi Restoration. He is best known for having one wife, Empress Zhang, and no other consorts, which was almost unheard of for an emperor.',
    ],
    introZh: [
      '同样出自原藏紫禁城南薰殿、今藏台北故宫的《明代帝后半身像》册。入画里把两幅并排展示。',
      '朱祐樘（1470–1505）1487年即位，年号弘治。史家一般认为他是明代较勤勉的皇帝之一，其在位时期常被称为“弘治中兴”。他最为人知的一点，是一生只有张皇后一位妻子，没有其他妃嫔，这在历代帝王中极为少见。',
    ],
    figures: {
      emperor: {
        en: 'Zhu Youtang, the Hongzhi Emperor. Hardworking by Ming standards, and unusual among emperors for keeping only one wife.',
        zh: '弘治皇帝朱祐樘。在明代皇帝中算是勤政的，一生只有一位妻子，在帝王中很少见。',
      },
    },
  },
  kulou: {
    slug: 'skeleton-puppet-show',
    width: 1980, height: 2016,
    museumEn: 'Palace Museum, Beijing',
    museumZh: '北京故宫博物院',
    introEn: [
      'The Skeleton Puppet Show (Kulou huanxi tu) is a small round fan painting in ink and color on silk by Li Song (active around 1190–1230), a court painter of the Southern Song dynasty who is said to have started out as a carpenter.',
      'A large skeleton in a gauze cap and robe sits on the ground working a small skeleton marionette. A toddler crawls toward the puppet, and a young woman reaches out to hold him back. Beside a peddler\'s load, a woman nurses a baby. Nobody seems frightened. The painting has no written explanation, and people still argue over what Li Song meant by it; most readings have to do with life and death sitting right next to each other.',
    ],
    introZh: [
      '《骷髅幻戏图》是一幅绢本设色的团扇小品，作者李嵩（约活跃于1190–1230年）是南宋宫廷画家，据说早年做过木工。',
      '一具头戴纱幞、身穿长衫的大骷髅坐在地上，提线操弄一个小骷髅傀儡。一个小孩朝傀儡爬过去，后面的年轻女子伸手要拦。货郎担旁，一位妇人正在给婴儿喂奶。画中没有人显得害怕。画上没有题字解释，李嵩究竟想说什么至今众说纷纭，大多数解读都和生与死近在咫尺有关。',
    ],
    figures: {
      skeleton: {
        en: 'A large skeleton in a gauze cap and robe, sitting on the ground and working a small skeleton marionette on strings.',
        zh: '头戴纱幞、身着长衫的大骷髅，席地而坐，提线操弄小骷髅傀儡。',
      },
    },
  },
  zhongkui_fangxun: {
    slug: 'zhong-kui-by-fang-xun',
    width: 1642, height: 2600,
    museumEn: null,
    museumZh: null,
    introEn: [
      'Zhong Kui is the demon queller of Chinese folklore. The best-known version of his story says Emperor Xuanzong of Tang fell ill and dreamed that a large, ugly man in an official\'s cap caught and ate a demon that had been tormenting him. The man said he was Zhong Kui, a scholar who had failed the imperial exams and taken his own life. When the emperor woke up he was well, and he had the painter Wu Daozi paint what he had seen. Pictures of Zhong Kui have been hung to keep evil away ever since, especially at New Year and the Dragon Boat Festival.',
      'This version is by Fang Xun (1736–1799), a Qing painter also known for his writing on painting. Instead of fighting, his Zhong Kui seems to be telling off a little demon, who holds out a bowl of wine.',
    ],
    introZh: [
      '钟馗是民间传说中捉鬼的神。流传最广的说法是：唐玄宗患病，梦见一个戴官帽、相貌丑陋的大汉捉住并吃掉了纠缠他的小鬼。大汉自称钟馗，是应举不第、自尽而死的书生。玄宗醒后病愈，命画家吴道子将梦中所见画下。此后人们挂钟馗像驱邪，尤其在新年和端午。',
      '这一幅出自清代画家方薰（1736–1799）之手，他也以画论著称。画中的钟馗没有在捉鬼，倒像在训话，一旁的小鬼捧着一碗酒奉上。',
    ],
  },
};

const DYNASTY_EN = {
  '唐': 'Tang dynasty', '五代': 'Five Dynasties', '南宋': 'Southern Song dynasty',
  '明': 'Ming dynasty', '清': 'Qing dynasty',
};

export function getPaintingPages() {
  return PAINTINGS.map(p => {
    const page = PAGES[p.id];
    return {
      id: p.id,
      slug: page.slug,
      titleZh: p.title,
      titleEn: p.sub,
      dynastyZh: p.dynasty,
      dynastyEn: DYNASTY_EN[p.dynasty],
      dateEn: page.dateEn ?? p.dynastyFull,
      dateZh: page.dateZh ?? p.dynastyFullZh,
      artistEn: page.artistEn ?? p.artistFull.replace(/^[^A-Za-z]+/, ''),
      artistZh: page.artistZh ?? p.artist,
      museumEn: page.museumEn,
      museumZh: page.museumZh,
      image: p.directImageUrl,
      width: page.width,
      height: page.height,
      introEn: page.introEn,
      introZh: page.introZh,
      figures: p.figures.map(f => ({
        id: f.id,
        nameZh: f.name,
        nameEn: f.nameEn,
        descEn: page.figures?.[f.id]?.en ?? f.descEn,
        descZh: page.figures?.[f.id]?.zh ?? f.descZh,
      })),
    };
  });
}

export function getPaintingPage(slug) {
  return getPaintingPages().find(p => p.slug === slug) ?? null;
}
