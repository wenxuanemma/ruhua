import { useState, useEffect, useRef, useCallback } from "react";
import { useGenerate, loadLastSelfie } from '../hooks/useGenerate';
import { FACE_REGIONS } from '../lib/faceRegions';

// ─── Design Tokens ──────────────────────────────────────────────────────────

const C = {
  bg: '#0c0904',
  card: '#18110a',
  cardDeep: '#100c06',
  border: 'rgba(201,168,76,0.2)',
  borderSub: 'rgba(201,168,76,0.08)',
  silk: '#f2e2c0',
  silkDim: 'rgba(242,226,192,0.52)',
  silkFaint: 'rgba(242,226,192,0.2)',
  vermillion: '#bf2429',
  vermillionBright: '#d42a2f',
  gold: '#c9a84c',
  goldFaint: 'rgba(201,168,76,0.1)',
  goldMid: 'rgba(201,168,76,0.22)',
};

const F = {
  brush: "'Ma Shan Zheng', serif",
  serif: "'Noto Serif SC', 'Noto Serif', serif",
  latin: "'IM Fell English SC', serif",
};

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@300;400;600&family=IM+Fell+English+SC&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }

@keyframes rise { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes stamp { 0%{transform:scale(2.4) rotate(-13deg);opacity:0} 72%{transform:scale(.97) rotate(1.8deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1} }
@keyframes floatY { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes spin { to { transform:rotate(360deg); } }
@keyframes bloom { from{transform:scale(.05);opacity:.7} to{transform:scale(8);opacity:0} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes flashW { 0%{opacity:0} 40%{opacity:1} 100%{opacity:0} }
@keyframes countIn { 0%{transform:scale(1.8);opacity:0} 35%{transform:scale(1);opacity:1} 75%{transform:scale(1);opacity:1} 100%{transform:scale(.7);opacity:0} }
@keyframes inkReveal { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0% 0 0)} }
@keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }

.r0{animation:rise .52s .05s both ease-out}
.r1{animation:rise .52s .18s both ease-out}
.r2{animation:rise .52s .32s both ease-out}
.r3{animation:rise .52s .46s both ease-out}
.r4{animation:rise .52s .60s both ease-out}
.r5{animation:rise .52s .74s both ease-out}
.r6{animation:rise .52s .88s both ease-out}
.stamp-a{animation:stamp .55s .25s both ease-out}
.float-a{animation:floatY 3.6s ease-in-out infinite}
.fade-a{animation:fadeIn .45s ease forwards}
.slide-a{animation:slideUp .5s ease forwards}

.card-h{transition:transform .22s ease,box-shadow .22s ease;cursor:pointer}
.card-h:hover{transform:translateY(-3px) scale(1.015);box-shadow:0 10px 36px rgba(201,168,76,.28)}

.btn{cursor:pointer;border:none;background:none;transition:all .18s ease}
.btn:hover{filter:brightness(1.1);transform:scale(1.025)}
.btn:active{transform:scale(.96)}

.fig-opt{cursor:pointer;transition:all .18s ease}
.fig-opt:hover{border-color:rgba(201,168,76,.55)!important;background:rgba(201,168,76,.08)!important}

.tab-btn{cursor:pointer;border:none;background:none;transition:all .18s ease;outline:none}
.tab-btn:hover{background:rgba(201,168,76,.05)!important}

::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(201,168,76,.25);border-radius:2px}
`;

// ─── Paintings Data ──────────────────────────────────────────────────────────

const PAINTINGS = [
  {
    id: 'hanxizai',
    wikiTitle: 'The_Night_Revels_of_Han_Xizai',
    title: '韩熙载夜宴图',
    sub: 'Night Revels of Han Xizai',
    subZh: '五代顾闳中绘，描绘韩熙载夜宴场景',
    dynasty: '五代',
    dynastyFull: 'Five Dynasties Period · c. 975 CE',
    dynastyFullZh: '五代时期 · 约975年',
    artist: '顾闳中',
    artistFull: '顾闳中 Gu Hongzhong',
    tagZh: '宫廷夜宴',
    tagEn: 'Court Banquet',
    grad: 'linear-gradient(148deg,#10060300 0%,#100603 0%,#3a100a 24%,#6a2c16 50%,#4a1e0e 74%,#100603 100%)',
    color: '#8a4020',
    figures: [
      { id:'guest',  name:'宾客',   nameEn:'Honored Guest',    descZh:'夜宴宾客，立于烛光之侧，见证这场盛宴的繁华与忧郁。',               descEn:'A guest at the night banquet, standing in the lamplight, witnessing the splendor and melancholy of this storied gathering.', gender:'man',   rec:true },
      { id:'host',   name:'韩熙载', nameEn:'Han Xizai (Host)', descZh:'南唐重臣，以纵情声色掩饰政治落寞，夜宴的主人与灵魂。',             descEn:'A high minister of Southern Tang who masked political despair with revelry — the host and soul of the banquet.', gender:'man',   rec:true, disabled:true },
      { id:'dancer', name:'乐伎',   nameEn:'Court Musician',   descZh:'席间乐伎，以悠扬琵琶声点亮烛光夜宴，是这场盛宴的华彩。',           descEn:'A court musician whose pipa fills the candlelit hall with melody, lending brilliance to the evening\'s revelry.', gender:'woman', rec:false, disabled:true },
    ],
    youAre: '宾客 · Honored Guest',
    context: 'Emperor Li Yu secretly sent painter Gu Hongzhong to spy on Han Xizai\'s private banquets. The result: five scenes of music, dance, and political melancholy in one of history\'s most intimate court scrolls.',
    contextZh: '南唐后主李煜派画家顾闳中潜入韩熙载府邸，秘密记录其夜宴情形。画卷呈现音乐、歌舞与政治忧郁，是中国历史上最具私密感的宫廷长卷之一。',
    scene: 'You stand in the lamplight as music fills the hall — pipa notes drifting through candlelight, the Southern Tang court burning brilliant and brief around you.',
    sceneZh: '你立于烛光之中，琵琶声在殿堂间流转，南唐朝廷的繁华在你身边绚烂而短暂地燃烧。',
  },
  {
    id: 'gongle',
    directImageUrl: '/paintings/gongle.jpg',
    title: '宫乐图',
    sub: 'Court Ladies Making Music',
    subZh: '唐代宫廷仕女音乐雅集图',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 9th century CE',
    dynastyFullZh: '唐代 · 约9世纪',
    artist: '佚名',
    artistFull: '佚名 Anonymous',
    tagZh: '仕女雅集',
    tagEn: 'Court Ladies',
    grad: 'linear-gradient(148deg,#1a0814 0%,#562040 24%,#925068 50%,#6a3850 74%,#1a0814 100%)',
    color: '#925068',
    figures: [
      { id:'pipa',    name:'琵琶仕女', nameEn:'Pipa Musician',      descZh:'轻拨琵琶，以指尖流淌的乐音为宴席增添盛唐风华。',                         descEn:'Plucking the pipa with delicate fingers, weaving the flourishing spirit of the Tang into the air of the gathering.', gender:'woman', rec:true },
      { id:'guzheng', name:'古筝仕女', nameEn:'Guzheng Musician',   descZh:'俯身抚筝，指间流出悠远古韵，是这场丝竹雅集的中心旋律。',                 descEn:'Leaning over the guzheng, her fingers drawing out a timeless melody that anchors the gathering\'s music.', gender:'woman', rec:true },
      { id:'clapper', name:'执拍侍女', nameEn:'Clapper Attendant',  descZh:'侍立一旁，手执拍板击节相和，以无声的节奏支撑起整场宴乐。',               descEn:'Standing to the side, keeping rhythm with the clapper — the quiet backbone of the entire musical performance.', gender:'woman', rec:true },
      { id:'listener',name:'听乐仕女', nameEn:'Lady Listening',     descZh:'手持茶碗，侧身聆听，神情闲适淡然，是宴席间最从容优雅的存在。',           descEn:'Holding a drinking bowl, listening with serene composure — the most unhurried and elegant presence at the gathering.', gender:'woman', rec:true },
    ],
    youAre: '琵琶仕女 · Pipa Musician',
    context: 'Ten Tang dynasty court ladies gather at a lacquered table — playing pipa, guzheng, hulusi and sheng, or simply listening. Their full-figured forms and elaborate hairstyles embody the cosmopolitan aesthetic of Tang at its height.',
    contextZh: '十位唐代宫廷仕女围坐漆桌，或奏琵琶、古筝、胡笳与笙，或执拍击节，或静静聆听。丰腴的体态与繁复的发饰，体现了盛唐开放包容的审美风貌。',
    scene: 'In the imperial garden, music rises around the lacquered table — osmanthus wine, half-moon overhead, the full splendor of Tang drifting through the evening air.',
    sceneZh: '御苑之中，丝竹声绕漆桌而起，桂花酒盈樽，半月当空，盛唐的华美在夜风中悠然流淌。',
  },
  {
    id: 'daolian',
    directImageUrl: '/paintings/daolian.jpg',
    title: '捣练图',
    sub: 'Court Ladies Preparing Silk',
    subZh: '唐代宫廷仕女捣练织绢图',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 8th century CE (Song copy)',
    dynastyFullZh: '唐代 · 约8世纪（宋摹本）',
    artist: '张萱（传）',
    artistFull: '张萱（传）Zhang Xuan (attrib.)',
    tagZh: '宫廷仕女',
    tagEn: 'Court Ladies',
    grad: 'linear-gradient(148deg,#1a1206 0%,#4a3418 24%,#9a7840 50%,#6a5228 74%,#1a1206 100%)',
    color: '#9a7840',
    figures: [
      { id:'girl',     name:'粉衣小童', nameEn:'Girl in Pink',        descZh:'粉衣小女，俯身于练布之下，姿态天真可爱。',                         descEn:'A little girl in pink, bending beneath the stretched silk with innocent, curious eyes.', gender:'woman', rec:true },
      { id:'threader', name:'穿针仕女', nameEn:'Lady Threading Silk', descZh:'细心穿针引线，将练丝精准穿入针孔，是织造工序中最考验耐心之人。', descEn:'Threading silk with patient precision — the most careful and exacting work of the silk-making process.', gender:'woman', rec:true },
    ],
    youAre: '熨绢仕女 · Lady of the Silk Chamber',
    context: 'Zhang Xuan\'s original is lost; this Song dynasty copy by Emperor Huizong depicts three groups of Tang court ladies processing newly woven silk — pounding, threading, and ironing. Held at the Museum of Fine Arts, Boston.',
    contextZh: '张萱原作已佚，此为宋徽宗摹本，描绘唐代宫廷仕女捣练、络线、熨绢三组劳作场景，现藏美国波士顿美术馆。',
    scene: 'In the imperial weaving chamber, silk gleams under the afternoon light — the sound of pounding, the pull of thread, the hiss of the iron, all moving in the ancient rhythm of the court.',
    sceneZh: '宫中织室，绢帛在午后光线下流光溢彩，捣练声、络线声、熨布声交织，千年宫廷的节律在指尖流转。',
  },
  {
    id: 'yinger',
    directImageUrl: '/paintings/yinger.jpg',
    title: '戏婴图',
    sub: 'Palace Ladies with Children',
    subZh: '唐代宫廷仕女嬉婴图',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 9th century CE',
    dynastyFullZh: '唐代 · 约9世纪',
    artist: '佚名',
    artistFull: '佚名 Anonymous',
    tagZh: '宫廷闲趣',
    tagEn: 'Palace Life',
    grad: 'linear-gradient(148deg,#140a04 0%,#3a2010 24%,#7a5028 50%,#4a3018 74%,#140a04 100%)',
    color: '#7a5028',
    figures: [
      { id:'topleft',    name:'左上仕女', nameEn:'Lady Top Left',    descZh:'身着红衣，膝前婴孩嬉闹，神情温柔专注，尽显内廷生活的温情一面。',       descEn:'Dressed in red, with a child playing before her knees — gentle and attentive, the warmest presence in the inner palace.', gender:'woman', rec:true },
      { id:'bottomleft', name:'左下仕女', nameEn:'Lady Bottom Left', descZh:'面容端正，背负婴孩，温柔守护，是内廷中最质朴动人的母性身影。',           descEn:'Front-facing with a child on her back, quietly protective — the most unadorned and touching maternal figure in the scene.', gender:'woman', rec:true },
      { id:'topcenter',  name:'中上仕女', nameEn:'Lady Top Center',  descZh:'端坐中央，面前婴孩牙牙学步，她从容守望，见证着孩童成长的每一刻。',       descEn:'Seated at center, watching a child take tentative steps before her — composed and present for every tender moment of growth.', gender:'woman', rec:true },
      { id:'right',      name:'右侧仕女', nameEn:'Lady on Right',    descZh:'头戴花饰，侧身望向爬行的婴孩，神情悠然，是画面中最雍容华贵的仕女。',   descEn:'Adorned with floral ornaments, watching a crawling child with serene ease — the most stately and elegant figure in the scene.', gender:'woman', rec:true },
    ],
    youAre: '左上仕女 · Palace Lady',
    context: 'Tang court ladies at leisure with children in the imperial palace. The full-figured beauties and playful children capture the warmth and intimacy of inner court life at its most unguarded. Held at the Metropolitan Museum of Art (CC0).',
    contextZh: '唐代宫廷仕女与孩童嬉戏于宫苑之中，丰腴的美人与活泼的婴孩，呈现出内廷生活最温情、最自在的一面。现藏美国大都会艺术博物馆（CC0）。',
    scene: 'A quiet afternoon in the inner palace — children\'s laughter fills the gilded rooms, afternoon light filters through silk screens, and the grandeur of the court softens into warmth.',
    sceneZh: '内廷静谧的午后，孩童的笑声在金碧辉煌的宫室中回荡，午后光线透过丝屏轻柔洒落，宫廷的威仪在此刻化为温情。',
  },
  {
    id: 'tiaoqin',
    directImageUrl: '/paintings/tiaoqin.jpg',
    title: '调琴啜茗图',
    sub: 'Ladies at the Lute and at Rest',
    subZh: '唐周昉绘宫廷仕女调琴静坐图',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 8th–9th century CE',
    dynastyFullZh: '唐代 · 约8至9世纪',
    artist: '周昉',
    artistFull: '周昉 Zhou Fang',
    tagZh: '仕女雅趣',
    tagEn: 'Elegant Leisure',
    grad: 'linear-gradient(148deg,#0e1208 0%,#283820 24%,#506840 50%,#384828 74%,#0e1208 100%)',
    color: '#506840',
    figures: [
      { id:'lady',    name:'调琴仕女', nameEn:'Lady at the Lute', descZh:'轻拨琴弦，以指尖的律动传递内心的雅致与从容，是园中最动人的风景。', descEn:'Tuning the qin with unhurried fingers, her inner elegance expressed through each gentle pluck of the strings.', gender:'woman', rec:true },
      { id:'seated',  name:'静坐仕女', nameEn:'Lady at Rest',     descZh:'白衣端坐，神情悠然，于琴声与园景之间静享这份难得的闲适时光。',   descEn:'Seated in white robes with serene composure, quietly savoring a rare moment of unhurried peace amid the garden and music.', gender:'woman', rec:true },
    ],
    youAre: '调琴仕女 · Lady of Refined Taste',
    context: 'Zhou Fang, master of Tang court beauty painting, depicts ladies in an aristocratic garden — one tuning a qin lute, another seated in quiet repose. The painting epitomizes the cultivated leisure of Tang elite women.',
    contextZh: '唐代仕女画大家周昉，描绘贵族园中仕女闲居之景：一人调拨琴弦，一人白衣静坐，尽显唐代上层女性的雅致闲情。',
    scene: 'In a walled garden fragrant with osmanthus, the qin sounds softly — the afternoon stretching out in perfect, unhurried elegance.',
    sceneZh: '桂香幽幽的围墙园中，琴声低回，午后时光在从容雅致中悠然流淌。',
  },
  {
    id: 'huishan',
    directImageUrl: '/paintings/huishan.jpg',
    bgPosition: '80% center',
    title: '挥扇仕女图',
    sub: 'Court Ladies with Fans',
    subZh: '唐周昉绘宫廷仕女挥扇图',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 8th–9th century CE',
    dynastyFullZh: '唐代 · 约8至9世纪',
    artist: '周昉',
    artistFull: '周昉 Zhou Fang',
    tagZh: '仕女风情',
    tagEn: 'Court Beauties',
    grad: 'linear-gradient(148deg,#0a0810 0%,#281e3a 24%,#584870 50%,#3a2e52 74%,#0a0810 100%)',
    color: '#584870',
    figures: [
      { id:'center', name:'执瓶仕女', nameEn:'Lady with Vase',    descZh:'手持青瓷瓶，步履从容，华美的外表下隐藏着一丝难以言说的忧郁。',       descEn:'Carrying a celadon vase with unhurried grace, a quiet melancholy hidden beneath her elegant exterior.', gender:'woman', rec:true },
      { id:'seated', name:'倚坐仕女', nameEn:'Seated Court Lady', descZh:'倚坐于园中，手执团扇，神情慵懒而美丽，是盛夏宫苑中最典型的仕女姿态。', descEn:'Reclining in the garden with a round fan, languid and lovely — the quintessential court beauty of a Tang summer afternoon.', gender:'woman', rec:true },
    ],
    youAre: '执瓶仕女 · Lady of the Inner Court',
    context: 'Zhou Fang\'s masterpiece of Tang court beauty depicts ladies in summer leisure — holding fans, vases, and accessories in the palace gardens. The melancholic stillness beneath the surface elegance made this one of the most celebrated figure paintings of the Tang dynasty.',
    contextZh: '周昉传世名作，描绘盛夏宫苑中仕女闲居之态：执扇、持瓶、把玩器物，华美之下流露出淡淡的忧郁与倦意，是唐代人物画中最受推崇的作品之一。',
    scene: 'A summer afternoon in the palace garden — silk robes heavy with perfume, fans stirring the heat, the languid beauty of a court that seems eternal, and is not.',
    sceneZh: '盛夏宫苑的午后，丝袍沉香，团扇轻摇，这繁华似乎永恒——却终将逝去。',
  },
  {
    id: 'mingdaidihou_taizu',
    directImageUrl: '/paintings/mingdaidihou_taizu.jpg',
    title: '明太祖后半身像',
    sub: 'Portraits of Emperor Taizu & Empress Ma',
    subZh: '明太祖朱元璋与孝慈高皇后半身像',
    dynasty: '明',
    dynastyFull: 'Ming Dynasty · late 14th century CE',
    dynastyFullZh: '明代 · 14世纪末',
    artist: '佚名（南薰殿）',
    artistFull: '佚名 Anonymous (Nanxundian Court Portraits)',
    tagZh: '帝后同框',
    tagEn: 'Emperor & Empress',
    grad: 'linear-gradient(148deg,#140c02 0%,#4a3208 24%,#9a7418 50%,#6a4e10 74%,#140c02 100%)',
    color: '#9a7418',
    figures: [
      { id:'empress', name:'孝慈高皇后', nameEn:'Empress Ma',  descZh:'明太祖结发妻，以贤德持家、劝谏太祖著称，是中国历史上最受敬重的皇后之一。', descEn:'Wife of the founding emperor, revered through history for her wisdom and moderating counsel — one of the most respected empresses in Chinese history.', gender:'woman', rec:true },
      { id:'emperor', name:'明太祖',     nameEn:'Emperor Taizu (Zhu Yuanzhang)', descZh:'白手起家的开国皇帝，自布衣至天子，一手建立大明王朝，奠定近三百年基业。', descEn:'The founding emperor who rose from a peasant orphan to unite China, establishing the Ming dynasty that would last nearly three centuries.', gender:'man', rec:true },
    ],
    youAre: '孝慈高皇后 · Empress Ma',
    context: 'These formal court portraits, part of the Qing-dynasty Nanxundian collection, depict Ming founder Zhu Yuanzhang and his empress Ma in old age. Unlike flattering idealized portraiture, Ming imperial portraits were prized for unflinching realism — every wrinkle and feature rendered true to life. Held at the National Palace Museum, Taipei.',
    contextZh: '这组正式宫廷画像出自清代南薰殿旧藏，描绘明代开国皇帝朱元璋与孝慈高皇后晚年容貌。明代帝后像素以写实著称，不加美化，一笔一划皆求形神毕肖。现藏台北故宫博物院。',
    scene: 'In the golden hall of the founding court, silk robes catch the lamplight — two portraits facing forward in eternal, unblinking dignity, witnesses to the birth of an empire.',
    sceneZh: '开国宫廷的金色殿堂中，绸袍映着烛光，两幅画像端然相对，庄重不苟，见证着一个王朝的诞生。',
  },
  {
    id: 'mingdaidihou_xuanzong',
    directImageUrl: '/paintings/mingdaidihou_xuanzong.jpg',
    title: '明宣宗后半身像',
    sub: 'Portraits of Emperor Xuanzong & Empress Sun',
    subZh: '明宣宗朱瞻基与孝恭章皇后半身像',
    dynasty: '明',
    dynastyFull: 'Ming Dynasty · early 15th century CE',
    dynastyFullZh: '明代 · 15世纪初',
    artist: '佚名（南薰殿）',
    artistFull: '佚名 Anonymous (Nanxundian Court Portraits)',
    tagZh: '帝后同框',
    tagEn: 'Emperor & Empress',
    grad: 'linear-gradient(148deg,#140c02 0%,#4a3208 24%,#9a7418 50%,#6a4e10 74%,#140c02 100%)',
    color: '#9a7418',
    figures: [
      { id:'empress', name:'孝恭章皇后', nameEn:'Empress Sun',  descZh:'以美貌与聪慧著称，深受宣宗宠爱，母仪天下，是明代宫廷中颇具传奇色彩的皇后。', descEn:'Renowned for her beauty and intelligence, deeply favored by the emperor — one of the most storied empresses of the Ming court.', gender:'woman', rec:true },
      { id:'emperor', name:'明宣宗',     nameEn:'Emperor Xuanzong (Zhu Zhanji)', descZh:'文武兼修的守成之君，开创「仁宣之治」，工书善画，是明代少有的艺术家皇帝。', descEn:'A cultured ruler whose reign is remembered as a golden age of stability — himself a skilled painter and calligrapher, rare among emperors.', gender:'man', rec:true },
    ],
    youAre: '孝恭章皇后 · Empress Sun',
    context: 'Zhu Zhanji presided over the "Renxuan Reign," an era of peace and prosperity still remembered as a high point of Ming governance. An accomplished painter himself, he is portrayed here beside Empress Sun in the formal Nanxundian court style. Held at the National Palace Museum, Taipei.',
    contextZh: '朱瞻基在位期间开创「仁宣之治」，是明代公认的盛世之一。他本人亦擅丹青，此像与孙皇后并列南薰殿藏画之中，尽显宫廷正统气度。现藏台北故宫博物院。',
    scene: 'Beneath painted eaves, brush and ink rest on the imperial desk — a reign remembered not for conquest, but for the quiet flourishing of art and peace.',
    sceneZh: '画檐之下，御案上笔墨犹在——这盛世不以征伐留名，却以翰墨与太平传世。',
  },
  {
    id: 'mingdaidihou_xiaozong',
    directImageUrl: '/paintings/mingdaidihou_xiaozong.jpg',
    title: '明孝宗后半身像',
    sub: 'Portraits of Emperor Xiaozong & Empress Zhang',
    subZh: '明孝宗朱祐樘与孝康敬皇后半身像',
    dynasty: '明',
    dynastyFull: 'Ming Dynasty · late 15th century CE',
    dynastyFullZh: '明代 · 15世纪末',
    artist: '佚名（南薰殿）',
    artistFull: '佚名 Anonymous (Nanxundian Court Portraits)',
    tagZh: '帝后同框',
    tagEn: 'Emperor & Empress',
    grad: 'linear-gradient(148deg,#140c02 0%,#4a3208 24%,#9a7418 50%,#6a4e10 74%,#140c02 100%)',
    color: '#9a7418',
    figures: [
      { id:'empress', name:'孝康敬皇后', nameEn:'Empress Zhang', descZh:'明孝宗一生唯一的妻子，二人相守终身，未曾立妃，为历代帝王中所罕见。', descEn:'The only wife Emperor Xiaozong ever took — the two remained devoted to each other for life, with no other consorts, a rarity among emperors.', gender:'woman', rec:true },
      { id:'emperor', name:'明孝宗',     nameEn:'Emperor Xiaozong (Zhu Youtang)', descZh:'史上罕见的「一夫一妻」皇帝，勤政爱民，开创「弘治中兴」，被誉为明代最专情的帝王。', descEn:'Remembered as history\'s most monogamous emperor — a devoted, hardworking ruler whose reign is called the "Hongzhi Restoration."', gender:'man', rec:true },
    ],
    youAre: '孝康敬皇后 · Empress Zhang',
    context: 'Zhu Youtang is celebrated as the most faithful emperor in Chinese history — he took no concubines and remained devoted solely to Empress Zhang throughout his reign, an extraordinary choice for a Ming sovereign. Together they preside over what historians call the "Hongzhi Restoration." Held at the National Palace Museum, Taipei.',
    contextZh: '朱祐樘是中国历史上罕见的「专一」帝王，终其一生未纳妃嫔，与张皇后相伴始终，开创「弘治中兴」的清明之治，被后世誉为明代最深情的帝王。现藏台北故宫博物院。',
    scene: 'In a court where a thousand consorts were the norm, one emperor chose only one — and history remembers not his power, but his devotion.',
    sceneZh: '后宫佳丽三千本是常态，他却只择一人相伴终生——史书铭记的，不是他的权势，而是他的深情。',
  },
];

// ─── Shared Components ───────────────────────────────────────────────────────

function Seal({ text = '入画', size = 52 }) {
  return (
    <div className="stamp-a" style={{
      width: size, height: size, flexShrink: 0,
      background: C.vermillion,
      color: '#f5e8c4',
      fontFamily: F.brush,
      fontSize: size * 0.26,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      writingMode: 'vertical-rl',
      letterSpacing: '0.12em',
      boxShadow: `0 2px 14px rgba(191,36,41,0.45), inset 0 0 0 1.5px rgba(255,255,255,0.12)`,
    }}>
      {text}
    </div>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="btn" style={{
      color: C.silkDim, fontFamily: F.serif, fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '12px 16px 12px 0', marginBottom: 12,
      minHeight: 44, minWidth: 80,
    }}>
      ← 返回
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, width:'100%' }}>
      <div style={{ flex:1, height:1, background:`linear-gradient(to right, transparent, ${C.border})` }} />
      <div style={{ width:4, height:4, borderRadius:'50%', background:C.gold, opacity:.45 }} />
      <div style={{ flex:1, height:1, background:`linear-gradient(to left, transparent, ${C.border})` }} />
    </div>
  );
}

// ─── Home Screen ─────────────────────────────────────────────────────────────

function HomeScreen({ onBegin }) {
  return (
    <div style={{
      minHeight:'100vh', background:C.bg,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'48px 36px', position:'relative', overflow:'hidden',
    }}>
      {/* Ink atmosphere blobs */}
      <div style={{ position:'absolute', top:'5%', right:'-5%', width:220, height:220,
        borderRadius:'60% 40% 70% 30%',
        background:'radial-gradient(circle, rgba(191,36,41,.05) 0%, transparent 70%)',
        pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'8%', left:'-8%', width:260, height:260,
        borderRadius:'40% 60% 30% 70%',
        background:'radial-gradient(circle, rgba(201,168,76,.04) 0%, transparent 70%)',
        pointerEvents:'none' }} />

      <div className="r0" style={{ marginBottom:36, width:'100%' }}><Divider /></div>

      {/* Main title */}
      <div className="r1 float-a" style={{ textAlign:'center', marginBottom:6 }}>
        <div style={{ fontFamily:F.brush, fontSize:96, color:C.silk, lineHeight:1, letterSpacing:'.1em' }}>
          入画
        </div>
      </div>

      {/* Latin subtitle */}
      <div className="r2" style={{
        fontFamily:F.latin, fontSize:13, color:C.silkDim,
        letterSpacing:'.35em', marginBottom:28,
      }}>
        Enter the Painting
      </div>

      {/* Seal */}
      <div className="r3" style={{ marginBottom:28 }}>
        <Seal text="入古画" size={62} />
      </div>

      {/* Taglines */}
      <div className="r3" style={{ textAlign:'center', marginBottom:8 }}>
        <div style={{ fontFamily:F.serif, fontSize:15, color:C.silk, fontWeight:300, letterSpacing:'.28em' }}>
          穿越千年，入古名画
        </div>
      </div>
      <div className="r4" style={{ textAlign:'center', marginBottom:44 }}>
        <div style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.18em' }}>
          Take a selfie · become a figure in classical Chinese art
        </div>
      </div>

      {/* CTA */}
      <div className="r5">
        <button onClick={onBegin} className="btn" style={{
          background:C.vermillion,
          color:'#f5e8c4',
          fontFamily:F.brush,
          fontSize:22,
          padding:'13px 56px',
          letterSpacing:'.45em',
          boxShadow:`0 4px 28px rgba(191,36,41,.38)`,
        }}>
          开始
        </button>
      </div>

      <div className="r6" style={{ marginTop:18, fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.15em' }}>
        6 paintings · historically grounded · social-ready
      </div>

      <div className="r6" style={{ marginTop:36, width:'100%' }}><Divider /></div>

      {/* Small footnote */}
      <div style={{ marginTop:18, display:'flex', gap:16, alignItems:'center', opacity:.35 }}>
        {['北宋','唐','东晋','五代'].map(d => (
          <div key={d} style={{ fontFamily:F.serif, fontSize:10, color:C.silk }}>{d}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Gallery Screen ──────────────────────────────────────────────────────────

function GalleryScreen({ paintings, imgs, onSelect, onBack }) {
  return (
    <div style={{ minHeight:'100vh', background:C.bg, padding:'20px 18px 32px' }}>
      <div className="r0"><BackBtn onClick={onBack} /></div>
      <div className="r0" style={{ marginBottom:2 }}>
        <div style={{ fontFamily:F.brush, fontSize:34, color:C.silk }}>选择画作</div>
      </div>
      <div className="r1" style={{ marginBottom:22, fontFamily:F.latin, fontSize:12, color:C.silkFaint, letterSpacing:'.22em' }}>
        Choose Your Painting
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
        {paintings.map((p, i) => (
          <div key={p.id} className={`card-h r${Math.min(i + 2, 6)}`} onClick={() => onSelect(p)}
            style={{
              borderRadius:5, overflow:'hidden',
              border:`1px solid ${C.border}`,
              background: imgs[p.id] ? `url(${imgs[p.id]}) center/cover` : p.grad,
              aspectRatio:'3/4',
              position:'relative',
              display:'flex', flexDirection:'column', justifyContent:'flex-end',
              transition:'background .4s ease',
            }}>
            {/* Dim overlay */}
            <div style={{ position:'absolute', inset:0,
              background:'linear-gradient(to top, rgba(12,9,4,.88) 0%, rgba(12,9,4,.1) 55%, transparent 100%)' }} />

            {/* Ink texture lines */}
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:.06 }} viewBox="0 0 100 134">
              <path d="M10,20 Q50,10 90,25" fill="none" stroke="#f2e2c0" strokeWidth=".8"/>
              <path d="M5,60 Q55,48 95,65" fill="none" stroke="#f2e2c0" strokeWidth=".5"/>
              <path d="M15,100 Q45,88 88,105" fill="none" stroke="#f2e2c0" strokeWidth=".6"/>
              <circle cx="50" cy="67" r="22" fill="none" stroke="#f2e2c0" strokeWidth=".4"/>
            </svg>

            {/* Tag badge */}
            <div style={{ position:'absolute', top:9, left:9 }}>
              <div style={{
                background:'rgba(12,9,4,.72)',
                border:`1px solid ${C.border}`,
                color:C.gold,
                fontFamily:F.serif, fontSize:9,
                padding:'2px 7px', letterSpacing:'.08em',
              }}>
                {p.tagEn}
              </div>
            </div>

            {/* Info */}
            <div style={{ position:'relative', padding:'10px 10px 9px' }}>
              <div style={{ fontFamily:F.brush, fontSize:19, color:C.silk, lineHeight:1.15, marginBottom:3 }}>
                {p.title}
              </div>
              <div style={{ fontFamily:F.latin, fontSize:9, color:C.silkDim, letterSpacing:'.04em', marginBottom:5 }}>
                {p.sub.length > 26 ? p.sub.slice(0,26)+'…' : p.sub}
              </div>
              <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, fontWeight:300 }}>
                {p.dynasty} · {p.artist}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign:'center', marginTop:22, fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.14em' }}>
        More paintings coming · 更多画作即将开放
      </div>
    </div>
  );
}

// ─── Figure Screen ───────────────────────────────────────────────────────────

// ─── Shared Background Component ─────────────────────────────────────────────

function PaintingBackground({ painting }) {
  return (
    <div className="fade-a">
      <div style={{ fontFamily:F.brush, fontSize:24, color:C.silk, marginBottom:3 }}>
        历史背景
      </div>
      <div style={{ fontFamily:F.serif, fontSize:11, color:C.gold, marginBottom:2 }}>
        Historical Background
      </div>
      <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, marginBottom:16 }}>
        {painting?.subZh}
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, padding:16, marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <div style={{ fontFamily:F.brush, fontSize:22, color:C.silk }}>{painting?.title}</div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim }}>{painting?.sub}</div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, marginTop:2 }}>{painting?.artistFull}</div>
          </div>
          <div style={{
            width:36, height:36, background:C.vermillion,
            color:'#f5e8c4', fontFamily:F.brush, fontSize:11,
            display:'flex', alignItems:'center', justifyContent:'center',
            writingMode:'vertical-rl', flexShrink:0, marginLeft:10,
          }}>
            {painting?.dynasty}
          </div>
        </div>
        <div style={{ height:1, background:C.border, marginBottom:12 }} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div>
            <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, marginBottom:3 }}>朝代 · Dynasty</div>
            <div style={{ fontFamily:F.serif, fontSize:12, color:C.silk }}>{painting?.dynastyFullZh}</div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, marginTop:2 }}>{painting?.dynastyFull}</div>
          </div>
          <div>
            <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, marginBottom:3 }}>画家 · Artist</div>
            <div style={{ fontFamily:F.serif, fontSize:12, color:C.silk }}>{painting?.artistFull}</div>
          </div>
        </div>
        <div style={{ height:1, background:C.border, marginBottom:12 }} />
        <div style={{ fontFamily:F.serif, fontSize:13, color:C.silk, lineHeight:1.8, marginBottom:10 }}>
          {painting?.contextZh}
        </div>
        <div style={{ fontFamily:F.serif, fontSize:12, color:C.silkDim, lineHeight:1.8 }}>
          {painting?.context}
        </div>
      </div>

      <div style={{ background:'rgba(191,36,41,.07)', border:`1px solid rgba(191,36,41,.28)`, padding:'14px 16px' }}>
        <div style={{ fontFamily:F.serif, fontSize:10, color:C.vermillion, letterSpacing:'.1em', marginBottom:6 }}>
          你扮演的角色 · Your Role
        </div>
        <div style={{ fontFamily:F.brush, fontSize:20, color:C.silk, marginBottom:6 }}>
          {painting?.youAre}
        </div>
        <div style={{ fontFamily:F.serif, fontSize:13, color:C.silk, lineHeight:1.75, marginBottom:8 }}>
          {painting?.sceneZh}
        </div>
        <div style={{ fontFamily:F.serif, fontSize:12, color:C.silkDim, lineHeight:1.75 }}>
          {painting?.scene}
        </div>
      </div>
    </div>
  );
}

// ─── Figure Screen ────────────────────────────────────────────────────────────
function FigureScreen({ painting, imgs, hasCachedSelfie, onSelect, onBack }) {
  if (!painting) return null;
  const imgUrl = imgs?.[painting.id];
  const [showBg, setShowBg] = useState(false);
  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      {/* Hero — centered on first recommended figure if image available */}
      <div style={{
        background: imgUrl ? `url(${imgUrl}) ${painting?.bgPosition || "center"}/cover` : painting.grad,
        padding:'52px 22px 28px', position:'relative', overflow:'hidden',
        transition:'background .4s ease',
      }}>
        <div style={{ position:'absolute', inset:0,
          background:'linear-gradient(to bottom, rgba(12,9,4,.32) 0%, rgba(12,9,4,.55) 100%)' }} />
        <div style={{ position:'relative' }}>
          <div className="r0"><BackBtn onClick={onBack} /></div>
          <div className="r1" style={{ fontFamily:F.brush, fontSize:38, color:C.silk, marginBottom:4 }}>
            {painting.title}
          </div>
          <div className="r2" style={{ fontFamily:F.latin, fontSize:12, color:C.silkDim, letterSpacing:'.18em', marginBottom:14 }}>
            {painting.sub}
          </div>
          <div className="r3" style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{
              background:'rgba(12,9,4,.65)', border:`1px solid ${C.border}`,
              color:C.gold, fontFamily:F.serif, fontSize:11,
              padding:'3px 12px',
            }}>
              {painting.dynastyFull}
            </div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim }}>
              {painting.artistFull}
            </div>
          </div>
        </div>
      </div>

      {/* Tab toggle */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}` }}>
        {[{id:false,zh:'选角色',en:'FIGURES'},{id:true,zh:'背景',en:'BACKGROUND'}].map(t => (
          <button key={String(t.id)} onClick={() => setShowBg(t.id)}
            style={{
              flex:1, padding:'12px 0', background:'none', border:'none', cursor:'pointer',
              borderBottom: showBg === t.id ? `2px solid ${C.gold}` : '2px solid transparent',
              fontFamily:F.brush, fontSize:15,
              color: showBg === t.id ? C.gold : C.silkDim,
            }}>
            {t.zh}
          </button>
        ))}
      </div>

      <div style={{ padding:'24px 20px' }}>
        {!showBg ? (<>
          <div className="r3" style={{ fontFamily:F.brush, fontSize:26, color:C.silk, marginBottom:3 }}>
            选择角色
          </div>
          <div className="r4" style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.16em', marginBottom:20 }}>
            Choose your figure in the painting
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
            {painting.figures.map((fig, i) => {
              const figRegion = FACE_REGIONS[painting.id]?.[fig.id];
              if (fig.disabled || figRegion?.disabled) return null;
              return (<div key={fig.id} className={`fig-opt r${i + 3}`} onClick={() => onSelect(fig)}
                style={{
                  border:`1px solid ${fig.rec ? 'rgba(201,168,76,.38)' : C.border}`,
                  background: fig.rec ? C.goldFaint : 'transparent',
                  padding:'14px 16px', borderRadius:4,
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                }}>
                <div>
                  <div style={{ fontFamily:F.brush, fontSize:20, color:C.silk, marginBottom:2 }}>
                    {fig.name}
                  </div>
                  <div style={{ fontFamily:F.latin, fontSize:12, color:C.gold, marginBottom:6 }}>
                    {fig.nameEn}
                  </div>
                  <div style={{ fontFamily:F.serif, fontSize:11, color:C.silk, lineHeight:1.6, marginBottom:3 }}>
                    {fig.descZh}
                  </div>
                  <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, lineHeight:1.6 }}>
                    {fig.descEn}
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          <div className="r6" style={{ marginTop:20, padding:'12px 14px',
            border:`1px solid ${C.borderSub}`, background:'rgba(201,168,76,.04)' }}>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, lineHeight:1.65 }}>
              {hasCachedSelfie
                ? '✓ 使用上次自拍 · 直接入画，无需重新拍照'
                : '💡 选择人物后，拍摄正面自拍以获得最佳效果'}
            </div>
          </div>
        </>) : (
          <PaintingBackground painting={painting} />
        )}
      </div>
    </div>
  );
}

// ─── Selfie Screen ───────────────────────────────────────────────────────────

function SelfieScreen({ painting, figure, imgs, onConfirm, onConfirmWithSelfie, onCaptured, onRetake, onBack }) {
  const lastSelfie = loadLastSelfie();
  const [camState, setCamState] = useState(lastSelfie ? 'done' : 'starting');
  const [count, setCount] = useState(3);
  const [capturedImg, setCapturedImg] = useState(lastSelfie || null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Start front camera on mount — skip if already showing cached selfie
  useEffect(() => {
    if (lastSelfie) return;
    let active = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCamState('live');
      } catch (err) {
        if (active) setCamState('error');
      }
    }
    startCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Countdown tick
  useEffect(() => {
    if (camState !== 'counting') return;
    if (count > 1) {
      const t = setTimeout(() => setCount(c => c - 1), 700);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        // Capture frame
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas) {
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 960;
          const ctx = canvas.getContext('2d');
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0);
        }
        setCamState('flash');
        setTimeout(async () => {
          const img = canvasRef.current?.toDataURL('image/jpeg', 0.92);
          setCapturedImg(img);
          setCamState('done');
          streamRef.current?.getTracks().forEach(t => t.stop());

          if (!img) return;

          // Detect face bounds using browser's FaceDetector API (fast, free, no library)
          // Falls back gracefully if not supported
          let faceBounds = null;
          try {
            if ('FaceDetector' in window) {
              const detector = new window.FaceDetector({ fastMode: true });
              const blob = await (await fetch(img)).blob();
              const bitmap = await createImageBitmap(blob);
              const faces = await detector.detect(bitmap);
              if (faces.length > 0) {
                // Take the largest face
                const face = faces.reduce((a, b) =>
                  (b.boundingBox.width * b.boundingBox.height) >
                  (a.boundingBox.width * a.boundingBox.height) ? b : a
                );
                const iw = bitmap.width, ih = bitmap.height;
                // Add 25% padding around detected face so we include forehead/chin/ears
                const pad = 0.25;
                const fx = face.boundingBox.x / iw;
                const fy = face.boundingBox.y / ih;
                const fw = face.boundingBox.width / iw;
                const fh = face.boundingBox.height / ih;
                faceBounds = {
                  x: Math.max(0, fx - fw * pad),
                  y: Math.max(0, fy - fh * pad),
                  w: Math.min(1, fw * (1 + pad * 2)),
                  h: Math.min(1, fh * (1 + pad * 2.5)), // extra vertical for chin
                };
              }
            }
          } catch (e) {
            // FaceDetector not available — composite.js will use full-height fallback
            console.log('FaceDetector unavailable, using fallback crop');
          }

          onCaptured?.(img, faceBounds);
        }, 380);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [camState, count]);

  const handleCapture = () => {
    if (camState !== 'live') return;
    setCamState('counting');
    setCount(3);
  };

  const handleRetake = async () => {
    setCapturedImg(null);
    setCount(3);
    setCamState('starting');
    onRetake?.();  // clear styled face cache — new selfie = new generation
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCamState('live');
    } catch {
      setCamState('error');
    }
  };

  const viewfinderBorder = camState === 'done' ? C.gold : camState === 'error' ? C.vermillion : C.border;

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'20px 20px 0' }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontFamily:F.brush, fontSize:30, color:C.silk, marginBottom:2 }}>拍摄自拍</div>
        <div style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.2em', marginBottom:16 }}>
          Take Your Selfie
        </div>
      </div>

      {/* Figure info strip */}
      <div style={{ padding:'0 20px 16px' }}>
        <div style={{
          border:`1px solid ${C.border}`, background:C.goldFaint,
          padding:'10px 14px', display:'flex', alignItems:'center', gap:12,
        }}>
          <div style={{
            width:38, height:38,
            background: imgs?.[painting?.id] ? `url(${imgs[painting.id]}) center/cover` : painting?.grad,
            borderRadius:3, flexShrink:0,
          }} />
          <div>
            <div style={{ fontFamily:F.brush, fontSize:17, color:C.silk }}>
              {figure?.name} · {figure?.en}
            </div>
            <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, marginTop:2 }}>
              {painting?.title} · {painting?.dynasty}
            </div>
          </div>
        </div>
      </div>

      {/* Viewfinder */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'0 20px 24px' }}>
        <div style={{
          width:'100%', maxWidth:300, aspectRatio:'3/4',
          background:'#000',
          border:`2px solid ${viewfinderBorder}`,
          borderRadius:8, position:'relative', overflow:'hidden',
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'border-color .3s',
        }}>

          {/* Live video — mirrored for selfie feel */}
          <video ref={videoRef} playsInline muted
            style={{
              position:'absolute', inset:0,
              width:'100%', height:'100%',
              objectFit:'cover',
              transform:'scaleX(-1)',
              display: camState === 'done' ? 'none' : 'block',
            }}
          />

          {/* Captured image preview */}
          {camState === 'done' && capturedImg && (
            <img src={capturedImg} alt="selfie"
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
          )}

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} style={{ display:'none' }} />

          {/* Grid lines overlay */}
          {[33, 66].map(pct => (
            <div key={`v${pct}`} style={{ position:'absolute', left:`${pct}%`, top:0, bottom:0, width:1, background:'white', opacity:.1, zIndex:2, pointerEvents:'none' }} />
          ))}
          {[33, 66].map(pct => (
            <div key={`h${pct}`} style={{ position:'absolute', top:`${pct}%`, left:0, right:0, height:1, background:'white', opacity:.1, zIndex:2, pointerEvents:'none' }} />
          ))}

          {/* Face oval guide */}
          {camState !== 'done' && (
            <div style={{
              position:'absolute', top:'10%', left:'22%', width:'56%', height:'56%',
              border:`2px dashed ${C.vermillion}`,
              borderRadius:'50%',
              opacity: camState === 'flash' ? 0 : .75,
              transition:'opacity .2s',
              zIndex:3, pointerEvents:'none',
            }} />
          )}
          {camState === 'done' && (
            <div style={{
              position:'absolute', top:'10%', left:'22%', width:'56%', height:'56%',
              border:`2px solid ${C.gold}`,
              borderRadius:'50%', opacity:.7,
              zIndex:3, pointerEvents:'none',
            }} />
          )}

          {/* Corner brackets */}
          {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
            <div key={v+h} style={{
              position:'absolute', [v]:11, [h]:11,
              width:18, height:18,
              borderTop: v==='top' ? `2px solid ${C.gold}` : 'none',
              borderBottom: v==='bottom' ? `2px solid ${C.gold}` : 'none',
              borderLeft: h==='left' ? `2px solid ${C.gold}` : 'none',
              borderRight: h==='right' ? `2px solid ${C.gold}` : 'none',
              opacity:.6, zIndex:4, pointerEvents:'none',
            }} />
          ))}

          {/* Flash */}
          {camState === 'flash' && (
            <div style={{ position:'absolute', inset:0, background:'rgba(255,255,255,.9)', animation:'flashW .38s ease', zIndex:10 }} />
          )}

          {/* Starting spinner */}
          {camState === 'starting' && (
            <div style={{ textAlign:'center', zIndex:5 }}>
              <div style={{
                width:36, height:36, margin:'0 auto 10px',
                border:`2px solid ${C.border}`, borderTopColor:C.vermillion,
                borderRadius:'50%', animation:'spin 1s linear infinite',
              }} />
              <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim }}>启动摄像头…</div>
            </div>
          )}

          {/* Error state */}
          {camState === 'error' && (
            <div style={{ textAlign:'center', padding:20, zIndex:5 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📷</div>
              <div style={{ fontFamily:F.serif, fontSize:12, color:C.silk, marginBottom:4 }}>无法访问摄像头</div>
              <div style={{ fontFamily:F.latin, fontSize:10, color:C.silkFaint, lineHeight:1.5 }}>
                Camera permission denied.{'\n'}Please allow camera access and retry.
              </div>
            </div>
          )}

          {/* Countdown overlay */}
          {camState === 'counting' && (
            <div key={count} style={{
              position:'absolute', zIndex:10,
              fontFamily:F.brush, fontSize:96, color:'rgba(242,226,192,.92)',
              textShadow:'0 2px 20px rgba(0,0,0,.6)',
              animation:'countIn .65s ease',
            }}>
              {count}
            </div>
          )}

          {/* Done badge */}
          {camState === 'done' && (
            <div className="fade-a" style={{
              position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
              background:'rgba(12,9,4,.75)', border:`1px solid ${C.gold}`,
              color:C.gold, fontFamily:F.serif, fontSize:11,
              padding:'4px 14px', letterSpacing:'.12em', whiteSpace:'nowrap',
              zIndex:5,
            }}>
              {capturedImg === lastSelfie ? '↩ 上次自拍' : '✓ 自拍已捕捉'}
            </div>
          )}
        </div>

        {/* Pose hint */}
        <div style={{ width:'100%', maxWidth:300, marginTop:11 }}>
          <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, lineHeight:1.65 }}>
            ✓ 请保持正面朝向镜头以获得最佳效果
          </div>
        </div>

        {/* Buttons */}
        <div style={{ width:'100%', maxWidth:300, marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
          {camState !== 'done' ? (
            <>

              <button
                onClick={handleCapture}
                disabled={camState !== 'live'}
                className="btn"
                style={{
                  background: camState === 'live' ? C.vermillion : 'rgba(191,36,41,.3)',
                  color:'#f5e8c4', fontFamily:F.brush, fontSize:20,
                  padding:'14px', letterSpacing:'.35em',
                  cursor: camState === 'live' ? 'pointer' : 'default',
                  boxShadow: camState === 'live' ? `0 4px 22px rgba(191,36,41,.32)` : 'none',
                }}>
                {camState === 'live' ? '拍照' : camState === 'counting' ? `${count}…` : camState === 'error' ? '无法拍摄' : '准备中…'}
              </button>

            </>
          ) : (
            <>
              <button onClick={() => capturedImg === lastSelfie ? onConfirmWithSelfie(lastSelfie) : onConfirm()} className="btn" style={{
                background:C.vermillion, color:'#f5e8c4',
                fontFamily:F.brush, fontSize:20, padding:'14px', letterSpacing:'.35em',
                boxShadow:`0 4px 22px rgba(191,36,41,.32)`,
              }}>
                入画 →
              </button>
              <button onClick={handleRetake} className="btn" style={{
                background:'transparent', border:`1px solid ${C.border}`,
                color:C.silkDim, fontFamily:F.serif, fontSize:14, padding:'12px',
              }}>
                {capturedImg === lastSelfie ? '重新拍摄' : '重拍'}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Gender Screen ────────────────────────────────────────────────────────────

function GenderScreen({ onSelect, currentGender }) {
  return (
    <div style={{minHeight:'100vh',background:'#0c0904',display:'flex',flexDirection:'column',
                 alignItems:'center',justifyContent:'center',padding:32,gap:32}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:28,fontFamily:"'Ma Shan Zheng', serif",color:'#c9a84c',marginBottom:8}}>
          请选择
        </div>
        <div style={{fontSize:14,color:'rgba(242,226,192,0.55)'}}>
          Select your gender for a better result
        </div>
      </div>
      <div style={{display:'flex',gap:24}}>
        {[['woman','👩','女'],['man','👨','男']].map(([g, emoji, label]) => (
          <button key={g} onClick={() => onSelect(g)} style={{
            width:120, height:120, borderRadius:'50%',
            border:`2px solid ${currentGender===g ? '#f2e2c0' : '#c9a84c'}`,
            background: currentGender===g ? 'rgba(242,226,192,0.15)' : 'rgba(201,168,76,0.08)',
            cursor:'pointer',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,
            boxShadow: currentGender===g ? '0 0 12px rgba(242,226,192,0.3)' : 'none',
          }}>
            <span style={{fontSize:36}}>{emoji}</span>
            <span style={{fontSize:16,color:'#f2e2c0',fontFamily:"'Noto Serif SC', serif"}}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  { zh:'准备中',   en:'Preparing'                   },
  { zh:'风格迁移', en:'Applying style transfer'     },
  { zh:'合成入画', en:'Compositing into the scroll' },
  { zh:'完成',     en:'Done'                        },
];

function ProcessingScreen({ step, painting, imgs, styledUrl, error, onRetry }) {
  const imgUrl = styledUrl || imgs?.[painting?.id];
  return (
    <div style={{
      minHeight:'100vh',
      background: imgUrl ? `url(${imgUrl}) ${painting?.bgPosition || "center"}/cover` : (painting?.grad || C.bg),
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:32, position:'relative', overflow:'hidden',
    }}>
      {/* Dark overlay */}
      <div style={{ position:'absolute', inset:0, background:'rgba(12,9,4,.74)' }} />

      {/* Error state */}
      {error && (
        <div style={{ position:'relative', zIndex:1, textAlign:'center', padding:'0 24px' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
          <div style={{ fontFamily:F.brush, fontSize:22, color:C.silk, marginBottom:8 }}>生成失败</div>
          <div style={{ fontFamily:F.serif, fontSize:13, color:C.silkDim, lineHeight:1.7, marginBottom:24 }}>
            {error}
          </div>
          <button onClick={onRetry} className="btn" style={{
            border:`1px solid ${C.border}`, color:C.silkDim,
            fontFamily:F.brush, fontSize:16, padding:'12px 28px',
          }}>
            返回重试
          </button>
        </div>
      )}

      {/* Ink bloom rings */}
      {!error && [0,1,2].map(i => (
        <div key={i} style={{
          position:'absolute', top:'50%', left:'50%',
          width:80, height:80, borderRadius:'50%',
          background:`radial-gradient(circle, rgba(191,36,41,${.12 - i*.03}) 0%, transparent 70%)`,
          transform:'translate(-50%,-50%)',
          animation:`bloom ${2.2 + i*.55}s ${i*.65}s infinite ease-out`,
        }} />
      ))}

      {!error && <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:320, textAlign:'center' }}>
        <div style={{ fontFamily:F.brush, fontSize:30, color:C.silk, marginBottom:3 }}>
          {painting?.title}
        </div>
        <div style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.22em', marginBottom:38 }}>
          Entering the painting…
        </div>

        {/* Spinner */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:42 }}>
          <div style={{
            width:60, height:60,
            border:`2px solid ${C.border}`,
            borderTopColor:C.vermillion,
            borderRadius:'50%',
            animation:'spin 1.15s linear infinite',
          }}>
            <div style={{
              width:46, height:46, margin:5,
              border:`1px solid ${C.borderSub}`,
              borderBottomColor:C.gold,
              borderRadius:'50%',
              animation:'spin 1.9s linear infinite reverse',
            }} />
          </div>
        </div>

        {/* Step list */}
        <div style={{ display:'flex', flexDirection:'column', gap:16, textAlign:'left' }}>
          {STEPS.map((s, i) => {
            const done = step > i + 1;
            const active = step === i + 1;
            return (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:14,
                opacity: step > i ? 1 : .22,
                transition:'opacity .5s ease',
              }}>
                <div style={{
                  width:22, height:22, borderRadius:'50%', flexShrink:0,
                  background: done ? C.vermillion : 'transparent',
                  border:`2px solid ${done ? C.vermillion : active ? C.gold : C.border}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, color:'#f5e8c4',
                }}>
                  {done && '✓'}
                  {active && <div style={{
                    width:8, height:8, borderRadius:'50%', background:C.gold,
                    animation:'pulse 1s infinite',
                  }} />}
                </div>
                <div>
                  <div style={{ fontFamily:F.serif, fontSize:14, color: active ? C.silk : done ? C.silkDim : C.silkFaint }}>
                    {s.zh}
                  </div>
                  <div style={{ fontFamily:F.latin, fontSize:10, color:C.silkFaint, letterSpacing:'.1em' }}>
                    {s.en}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

// ─── Result Screen ───────────────────────────────────────────────────────────

function ResultScreen({ painting, figure, imgs, generatedUrl, profileUrl, styledUrl, cropBox, paintSampleBox, maskedFaceUrl, portraitCropUrl, faceBoundsBox, portraitLandmarks, selfie, onReset, onNew, onChangeFigure }) {
  const [tab, setTab] = useState('scene');
  const [showDebug, setShowDebug] = useState(false);
  const [naturalDims, setNaturalDims] = useState(null);
  const isDebug = process.env.NODE_ENV === 'development';
  const imgUrl = generatedUrl || imgs?.[painting?.id];
  const region = FACE_REGIONS[painting?.id]?.[figure?.id];

  // Profile crop background — use server-side cropped image if available,
  // otherwise fall back to CSS zoom of the full composited image
  function profileBg(containerPx) {
    if (profileUrl) return {
      backgroundImage: `url(${profileUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
    if (!region || !imgUrl) return {
      background: imgUrl ? `url(${imgUrl}) ${painting?.bgPosition || "center"}/cover` : painting?.grad,
    };
    const scale = Math.min(1 / region.w, 1 / region.h) * 0.72;
    const faceCenterX = region.x + region.w / 2;
    const faceCenterY = region.y + region.h / 2;
    return {
      backgroundImage: `url(${imgUrl})`,
      backgroundSize: `${scale * 100}%`,
      backgroundPosition: `${(0.5 - faceCenterX * scale) * containerPx}px ${(0.5 - faceCenterY * scale) * containerPx}px`,
      backgroundRepeat: 'no-repeat',
    };
  }

  // Smart marker positioning — places the label away from the face
  // to avoid overlapping, especially when face is at edges/corners
  const faceX = region ? region.x + region.w / 2 : 0.5;
  const faceY = region ? region.y + region.h / 2 : 0.45;

  // Position marker above face if face is in lower half, below if upper half
  // Add offset so the pin line points toward the face without covering it
  const markerAbove = faceY > 0.35; // face in lower half → label above
  const markerLeft = `${Math.round(faceX * 100)}%`;
  const markerTop  = markerAbove
    ? `${Math.max(5, Math.round((faceY - 0.18) * 100))}%`  // above face
    : `${Math.min(75, Math.round((faceY + 0.18) * 100))}%`; // below face — capped to avoid tab bar

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      {/* Hidden img to get painting natural dimensions for debug overlay */}
      {isDebug && imgs?.[painting?.id] && (
        <img src={imgs[painting.id]} alt="" onLoad={e => setNaturalDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          style={{ display:'none' }} />
      )}
      {/* Hero — composited output centered on face */}
      <div style={{ position:'relative', paddingTop:'62%', overflow:'hidden' }}>
        {imgUrl
          ? <img src={imgUrl} alt={painting?.title} style={{
              position:'absolute', inset:0, width:'100%', height:'100%',
              objectFit:'cover',
              objectPosition:`${Math.round(faceX * 100)}% ${Math.round(faceY * 100)}%`,
            }} />
          : <div style={{ position:'absolute', inset:0, background:painting?.grad }} />
        }
        <div style={{ position:'absolute', inset:0 }}>
          {/* Gradient overlay */}
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(to bottom, transparent 50%, rgba(12,9,4,.7) 100%)' }} />

          {/* Debug: face region box + oval overlay — top layer */}
          {isDebug && showDebug && region && naturalDims && (() => {
            // Container aspect: paddingTop 62% → containerW/containerH = 100/62
            const containerAspect = 100 / 62;
            const paintingAspect = naturalDims.w / naturalDims.h;

            // objectFit:cover scales the image so it fills the container.
            // objectPosition: faceX% faceY% means the painting point (faceX, faceY)
            // maps to the container point (faceX, faceY).
            //
            // Case: painting wider than container → height fills, width overflows.
            // Scale factor (painting→container, in fraction units):
            //   scaleX = scaleY * paintingH/paintingW * containerW/containerH
            //          = 1 * (containerAspect / paintingAspect)
            // Mapping: containerX = faceX + (paintingX - faceX) * scaleX
            //          containerY = faceY + (paintingY - faceY) * scaleY  [scaleY=1]
            //
            // Case: painting taller than container → width fills, height overflows.
            // scaleY = paintingAspect / containerAspect, scaleX = 1
            // Mapping: containerX = faceX + (paintingX - faceX) * scaleX  [scaleX=1]
            //          containerY = faceY + (paintingY - faceY) * scaleY

            let sx, sy; // scale factors painting→container in fraction space
            if (paintingAspect > containerAspect) {
              sy = 1;
              sx = containerAspect / paintingAspect;
            } else {
              sx = 1;
              sy = paintingAspect / containerAspect;
            }

            // Map region box corners
            const left = faceX + (region.x - faceX) * sx;
            const top  = faceY + (region.y - faceY) * sy;
            const w    = region.w * sx;
            const h    = region.h * sy;

            return (
              <div style={{
                position:'absolute',
                left:`${left*100}%`,
                top:`${top*100}%`,
                width:`${w*100}%`,
                height:`${h*100}%`,
                boxSizing:'border-box',
                transform:`rotate(${region.angle||0}deg)`,
                transformOrigin:'center center',
                pointerEvents:'none',
                zIndex:10,
              }}>
                <div style={{
                  position:'absolute', inset:0,
                  border:'2px solid #e24b4a',
                  boxSizing:'border-box',
                }}/>
                <div style={{
                  position:'absolute',
                  left:'8%', top:'4%',
                  width:'84%', height:'90%',
                  borderRadius:'50%',
                  border:'2px dashed #e24b4a',
                  boxSizing:'border-box',
                }}/>
              {/* Label */}
              <div style={{
                position:'absolute', top:-16, left:0,
                fontSize:9, color:'#e24b4a', whiteSpace:'nowrap',
                background:'rgba(0,0,0,0.7)', padding:'1px 4px',
              }}>composite区域</div>
            </div>
            );
          })()}

          {/* 你在此处 marker — offset from face to avoid overlap */}
          <div style={{
            position:'absolute',
            left: markerLeft,
            top:  markerTop,
            transform:'translate(-50%, -50%)',
            textAlign:'center',
            pointerEvents:'none',
          }}>
            <div style={{
              background:C.vermillion, color:'#f5e8c4',
              fontFamily:F.serif, fontSize:10,
              padding:'2px 9px', letterSpacing:'.1em', whiteSpace:'nowrap',
              marginBottom: markerAbove ? 4 : 0,
              marginTop:    markerAbove ? 0 : 4,
            }}>
              你在此处
            </div>
            <div style={{
              width:2, height:16, background:C.vermillion, margin:'0 auto', opacity:.7,
              order: markerAbove ? 1 : -1,
            }} />
          </div>
        </div>

        {/* Title bottom-left */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'14px 20px 16px' }}>
          <div style={{ fontFamily:F.brush, fontSize:26, color:C.silk, marginBottom:2 }}>
            {painting?.title}
          </div>
          <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim }}>
            {painting?.dynastyFull}
          </div>
        </div>

        <div style={{ position:'absolute', top:14, right:14 }}>
          <Seal text={painting?.dynasty || '宋'} size={38} />
        </div>
      </div>

      {/* Tab bar — Chinese only, clean */}
      <div style={{ display:'flex', background:C.card }}>
        {[
          { id:'scene',   label:'场景' },
          { id:'crop',    label:'头像' },
          { id:'history', label:'背景' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="tab-btn" style={{
            flex:1, padding:'13px 0',
            borderBottom:`2px solid ${tab === t.id ? C.vermillion : 'transparent'}`,
            background: tab === t.id ? 'rgba(201,168,76,.05)' : 'transparent',
          }}>
            <div style={{ fontFamily:F.brush, fontSize:18, color: tab === t.id ? C.silk : C.silkFaint }}>
              {t.label}
            </div>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding:'20px 20px 32px' }}>

        {/* ── 场景 tab ── */}
        {tab === 'scene' && (
          <div className="fade-a">
            <div style={{ fontFamily:F.brush, fontSize:24, color:C.silk, marginBottom:5 }}>
              {figure?.name}
              <span style={{ fontFamily:F.serif, fontSize:14, color:C.silkDim, marginLeft:10, fontWeight:300 }}>
                {figure?.en}
              </span>
            </div>
            <div style={{ fontFamily:F.serif, fontSize:13, color:C.silk, lineHeight:1.85, marginBottom:8 }}>
              {painting?.sceneZh}
            </div>
            <div style={{ fontFamily:F.serif, fontSize:12, color:C.silkDim, lineHeight:1.85, marginBottom:18 }}>
              {painting?.scene}
            </div>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, padding:'13px 15px' }}>
              <div style={{ fontFamily:F.serif, fontSize:11, color:C.gold, marginBottom:7 }}>
                {painting?.artistFull}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <div style={{
                  background:C.vermillion, color:'#f5e8c4',
                  fontFamily:F.serif, fontSize:10, padding:'2px 9px',
                }}>
                  {painting?.tagZh}
                </div>
                <div style={{
                  border:`1px solid ${C.border}`, color:C.silkDim,
                  fontFamily:F.serif, fontSize:10, padding:'2px 9px',
                }}>
                  {painting?.dynasty}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 头像 tab ── */}
        {tab === 'crop' && (
          <div className="fade-a" style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ fontFamily:F.brush, fontSize:18, color:C.silk, marginBottom:4 }}>社交头像</div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkFaint, marginBottom:18 }}>
              可用于微信、微博、小红书
            </div>

            {/* Circle crop — server-side cropped to face */}
            <div style={{
              width:196, height:196, borderRadius:'50%',
              ...profileBg(196),
              border:`3px solid ${C.gold}`,
              marginBottom:12, overflow:'hidden', position:'relative',
              boxShadow:`0 0 48px rgba(201,168,76,.22)`,
              flexShrink:0,
            }}>
              <div style={{ position:'absolute', inset:0,
                background:'radial-gradient(circle, transparent 55%, rgba(12,9,4,.55) 100%)',
                pointerEvents:'none' }} />
            </div>

            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkFaint, marginBottom:10 }}>
              圆形头像 · 微信 · 微博
            </div>

            {/* Download circle — canvas with circular clip → PNG */}
            <button className="btn" onClick={async () => {
              if (!profileUrl) return;
              try {
                const img = await new Promise((res, rej) => {
                  const i = new Image(); i.crossOrigin = 'anonymous';
                  i.onload = () => res(i); i.onerror = rej; i.src = profileUrl;
                });
                const sz = img.naturalWidth;
                const canvas = document.createElement('canvas');
                canvas.width = sz; canvas.height = sz;
                const ctx = canvas.getContext('2d');
                ctx.beginPath();
                ctx.arc(sz/2, sz/2, sz/2, 0, Math.PI*2);
                ctx.clip();
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                const blob = await fetch(dataUrl).then(r => r.blob());
                const file = new File([blob], 'ruhua_avatar_circle.png', { type: 'image/png' });
                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                  await navigator.share({ files: [file], title: '入画头像' });
                } else {
                  const a = document.createElement('a');
                  a.href = dataUrl; a.download = 'ruhua_avatar_circle.png'; a.click();
                }
              } catch(e) { if (e.name !== 'AbortError') window.open(profileUrl, '_blank'); }
            }} style={{
              fontFamily:F.serif, fontSize:11, color:C.gold, marginBottom:20,
              border:`1px solid ${C.gold}44`, padding:'4px 16px', borderRadius:20,
              background:'rgba(201,168,76,.08)',
            }}>
              ↓ 保存圆形头像
            </button>

            {/* Square crop — server-side cropped to face */}
            <div style={{
              width:180, height:180,
              ...profileBg(180),
              border:`2px solid ${C.border}`,
              position:'relative', overflow:'hidden', marginBottom:8,
              flexShrink:0,
            }}>
              <div style={{ position:'absolute', inset:0,
                background:'radial-gradient(circle, transparent 50%, rgba(12,9,4,.45) 100%)',
                pointerEvents:'none' }} />
              <div style={{
                position:'absolute', bottom:8, right:8,
                width:28, height:28, background:C.vermillion,
                color:'#f5e8c4', fontFamily:F.brush, fontSize:9,
                display:'flex', alignItems:'center', justifyContent:'center',
                writingMode:'vertical-rl', opacity:.9,
              }}>
                入画
              </div>
            </div>

            {/* Download square */}
            <button className="btn" onClick={async () => {
              if (!profileUrl) return;
              try {
                const blob = await fetch(profileUrl).then(r => r.blob());
                const file = new File([blob], 'ruhua_avatar_sq.jpg', { type: 'image/jpeg' });
                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                  await navigator.share({ files: [file], title: '入画头像' });
                } else {
                  const a = document.createElement('a');
                  a.href = profileUrl; a.download = 'ruhua_avatar_sq.jpg'; a.click();
                }
              } catch(e) { if (e.name !== 'AbortError') window.open(profileUrl, '_blank'); }
            }} style={{
              fontFamily:F.serif, fontSize:11, color:C.silkDim, marginBottom:4,
              border:`1px solid ${C.border}`, padding:'4px 16px', borderRadius:20,
              background:'rgba(201,168,76,.04)',
            }}>
              ↓ 保存方形头像
            </button>

            <div style={{ fontFamily:F.serif, fontSize:10, color:C.silkFaint }}>
              方形头像 · Instagram · 小红书
            </div>
          </div>
        )}

        {/* ── 背景 tab ── */}
        {tab === 'history' && (
          <PaintingBackground painting={painting} />
        )}

        {/* Action buttons */}
        <div style={{ marginTop:26, display:'flex', flexDirection:'column', gap:10 }}>
          <button className="btn" onClick={async () => {
            if (!imgUrl) return;
            const filename = `ruhua_${painting?.id || 'painting'}.jpg`;
            try {
              // imgUrl is a base64 data URL — fetch it directly as blob (no canvas/CORS issues)
              const res = await fetch(imgUrl);
              const blob = await res.blob();
              const file = new File([blob], filename, { type: 'image/jpeg' });
              if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: '入画', text: '我入画了！' });
              } else if (navigator.share) {
                await navigator.share({ title: '入画', text: '我入画了！', url: window.location.href });
              } else {
                // Web fallback: download
                const a = document.createElement('a');
                a.href = imgUrl;
                a.download = filename;
                a.click();
              }
            } catch (e) {
              if (e.name !== 'AbortError') {
                // Last resort: open in new tab
                window.open(imgUrl, '_blank');
              }
            }
          }} style={{
            background:C.vermillion, color:'#f5e8c4',
            fontFamily:F.brush, fontSize:19, padding:'14px', letterSpacing:'.38em',
            boxShadow:`0 4px 22px rgba(191,36,41,.32)`,
          }}>
            分享
          </button>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onNew} className="btn" style={{
              flex:1, border:`1px solid ${C.border}`,
              color:C.silkDim, fontFamily:F.brush, fontSize:15, padding:'12px',
            }}>
              换幅画
            </button>
            <button onClick={onChangeFigure} className="btn" style={{
              flex:1, border:`1px solid ${C.border}`,
              color:C.silkDim, fontFamily:F.brush, fontSize:15, padding:'12px',
            }}>
              换角色
            </button>
          </div>
          <button onClick={onReset} className="btn" style={{
            border:`1px solid rgba(201,168,76,0.15)`,
            color:'rgba(242,226,192,0.3)', fontFamily:F.serif, fontSize:13, padding:'10px',
          }}>
            重新拍照
          </button>

          {/* Debug: show raw converted face — dev only */}
          {isDebug && styledUrl && (
            <div style={{marginTop:16,textAlign:'center'}}>
              <button onClick={() => setShowDebug(d => !d)} style={{
                fontSize:11, color:'rgba(242,226,192,0.3)', background:'none',
                border:'1px solid rgba(242,226,192,0.1)', padding:'4px 10px', cursor:'pointer',
              }}>
                {showDebug ? '隐藏' : '🔍 查看转换人脸'}
              </button>
              {showDebug && (
                <div style={{marginTop:8}}>
                  <div style={{fontSize:10,color:'rgba(242,226,192,0.3)',marginBottom:8}}>
                    自拍 → 入画 (compositing前)
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'flex-start',overflowX:'auto',width:'100%'}}>
                    <div style={{textAlign:'center',flexShrink:0}}>
                      <div style={{fontSize:9,color:'rgba(242,226,192,0.25)',marginBottom:4}}>自拍</div>
                      {selfie && <img src={selfie} style={{
                        width:120,height:140,objectFit:'cover',objectPosition:'center 15%',
                        border:'1px solid rgba(201,168,76,0.2)',display:'block',
                      }}/>}
                    </div>
                    <div style={{color:'rgba(242,226,192,0.3)',fontSize:18,paddingTop:55,flexShrink:0}}>→</div>
                    <div style={{textAlign:'center',flexShrink:0}}>
                      <div style={{fontSize:9,color:'rgba(242,226,192,0.25)',marginBottom:4}}>入画 (裁剪区域)</div>
                      <div style={{position:'relative',display:'inline-block'}}>
                        <img src={styledUrl} style={{
                          width:120,height:140,objectFit:'cover',display:'block',
                          objectPosition:cropBox?`${(cropBox.x+cropBox.w/2)*100}% ${(cropBox.y+cropBox.h/2)*100}%`:'center 35%',
                          border:'1px solid rgba(201,168,76,0.2)',
                        }}/>
                        {cropBox && (
                          <div style={{
                            position:'absolute',
                            left:`${cropBox.x*100}%`,
                            top:`${cropBox.y*100}%`,
                            width:`${cropBox.w*100}%`,
                            height:`${cropBox.h*100}%`,
                            border:'2px solid #e24b4a',
                            boxSizing:'border-box',
                            pointerEvents:'none',
                          }}/>
                        )}
                        {faceBoundsBox && (
                          <div style={{
                            position:'absolute',
                            left:`${faceBoundsBox.x*100}%`,
                            top:`${faceBoundsBox.y*100}%`,
                            width:`${faceBoundsBox.w*100}%`,
                            height:`${faceBoundsBox.h*100}%`,
                            border:'2px solid #4488ff',
                            boxSizing:'border-box',
                            pointerEvents:'none',
                          }}/>
                        )}
                        {/* Landmark dots: forehead (green), chin (red), center (yellow) */}
                        {portraitLandmarks?.fromLandmarks && [
                          {y: portraitLandmarks.foreheadY, x: portraitLandmarks.centerX ?? 0.5, color:'#00ff88', label:'F'},
                          {y: portraitLandmarks.chinY,     x: portraitLandmarks.centerX ?? 0.5, color:'#ff4444', label:'C'},
                          {y: portraitLandmarks.centerY,   x: portraitLandmarks.centerX ?? 0.5, color:'#ffdd00', label:'•'},
                        ].map(({y, x, color, label}) => (
                          <div key={label} style={{
                            position:'absolute',
                            left:`${x*100}%`,
                            top:`${y*100}%`,
                            transform:'translate(-50%,-50%)',
                            width:8, height:8,
                            borderRadius:'50%',
                            background:color,
                            pointerEvents:'none',
                            zIndex:10,
                          }}/>
                        ))}
                      </div>
                    </div>
                    {portraitCropUrl && (<>
                      <div style={{color:'rgba(242,226,192,0.3)',fontSize:18,paddingTop:55,flexShrink:0}}>→</div>
                      <div style={{textAlign:'center',flexShrink:0}}>
                        <div style={{fontSize:9,color:'rgba(242,226,192,0.25)',marginBottom:4}}>入画人脸（裁剪后）</div>
                        <div style={{
                          width:80, height:80,
                          border:'1px solid rgba(201,168,76,0.2)',
                          background:'rgba(0,0,0,0.3)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          overflow:'hidden',
                        }}>
                          <img src={portraitCropUrl} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>
                        </div>
                      </div>
                    </>)}
                    {maskedFaceUrl && (<>
                      <div style={{color:'rgba(242,226,192,0.3)',fontSize:18,paddingTop:55,flexShrink:0}}>→</div>
                      <div style={{textAlign:'center',flexShrink:0}}>
                        <div style={{fontSize:9,color:'rgba(242,226,192,0.25)',marginBottom:4}}>合成面（裁剪后）</div>
                        <div style={{
                          width:80, height:80,
                          border:'1px solid rgba(201,168,76,0.2)',
                          background:'rgba(0,0,0,0.3)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          overflow:'hidden',
                        }}>
                          <img src={maskedFaceUrl} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',
                            transform: region?.angle ? `rotate(${region.angle}deg)` : undefined}}/>
                        </div>
                      </div>
                    </>)}
                    <div style={{color:'rgba(242,226,192,0.3)',fontSize:18,paddingTop:55,flexShrink:0}}>→</div>
                    <div style={{textAlign:'center',flexShrink:0}}>
                      <div style={{fontSize:9,color:'rgba(242,226,192,0.25)',marginBottom:4}}>原画人物</div>
                    {imgs?.[painting?.id] && figure && (() => {
                        const reg = FACE_REGIONS[painting?.id]?.[figure?.id];
                        if (!reg) return null;
                        const thumbW = 120, thumbH = 140;
                        // Region in painting pixels — fractions * painting dimensions
                        // naturalDims gives true painting pixel size; fall back to square if not loaded
                        const PW = naturalDims?.w ?? 1000;
                        const PH = naturalDims?.h ?? 1000;
                        const regWpx_paint = reg.w * PW;
                        const regHpx_paint = reg.h * PH;
                        // Scale to fit in thumbnail preserving true aspect ratio
                        const scale = Math.min(thumbW / regWpx_paint, thumbH / regHpx_paint);
                        const regWpx = regWpx_paint * scale;
                        const regHpx = regHpx_paint * scale;
                        // Center region in thumbnail
                        const offX = (thumbW - regWpx) / 2;
                        const offY = (thumbH - regHpx) / 2;
                        // Oval matching composite.js formula
                        const targetSize = Math.max(regWpx, regHpx);
                        const ovalRx = Math.min((regWpx / targetSize) * targetSize * 0.41, targetSize * 0.48);
                        const ovalRy = Math.min((regHpx / targetSize) * targetSize * 0.42, targetSize * 0.48);
                        // Paste center: 50% x, 55% y of region
                        const ovalCx = offX + regWpx * 0.50;
                        const ovalCy = offY + regHpx * 0.50;
                        // paintSampleBox: convert painting fractions to thumbnail pixels
                        const psb = paintSampleBox;
                        // img sizing: full painting scaled so region fills thumbnail
                        const imgScale = scale; // px per painting-pixel
                        return (
                          <div style={{
                            width:thumbW, height:thumbH,
                            overflow:'hidden',
                            border:'1px solid rgba(201,168,76,0.2)',
                            position:'relative',
                          }}>
                            <img src={imgs[painting.id]} style={{
                              position:'absolute',
                              width: `${PW * imgScale}px`,
                              height: 'auto',
                              left: `${offX - reg.x * PW * imgScale}px`,
                              top:  `${offY - reg.y * PH * imgScale}px`,
                              maxWidth:'none',
                            }}/>
                            {generatedUrl && (
                              <div style={{
                                position:'absolute',
                                left: ovalCx - ovalRx, top: ovalCy - ovalRy,
                                width: ovalRx * 2, height: ovalRy * 2,
                                borderRadius:'50%',
                                background:'rgba(100,160,255,0.20)',
                                border:'2px solid rgba(100,160,255,0.7)',
                                boxSizing:'border-box', pointerEvents:'none',
                                transform: reg.angle ? `rotate(${reg.angle}deg)` : undefined,
                                transformOrigin: 'center center',
                              }}/>
                            )}
                            {psb && (() => {
                              const boxL = offX + (psb.x - reg.x) * PW * imgScale;
                              const boxT = offY + (psb.y - reg.y) * PH * imgScale;
                              const boxW = psb.w * PW * imgScale;
                              const boxH = psb.h * PH * imgScale;
                              return (
                                <div style={{
                                  position:'absolute',
                                  left: boxL, top: boxT,
                                  width: boxW, height: boxH,
                                  border: '2px solid #00ff88',
                                  boxSizing:'border-box', pointerEvents:'none',
                                }}/>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {/* Download all 3 debug panels */}
                  <div style={{marginTop:10,display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
                    {selfie && (
                      <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = selfie;
                        a.download = 'debug_selfie.jpg';
                        a.click();
                      }} style={{fontSize:10,color:'rgba(242,226,192,0.5)',background:'none',border:'1px solid rgba(242,226,192,0.15)',padding:'3px 8px',cursor:'pointer',borderRadius:3}}>
                        ↓ 自拍
                      </button>
                    )}
                    {styledUrl && (<>
                      <button onClick={() => {
                        // Clean download — no red box
                        const a = document.createElement('a');
                        a.href = styledUrl;
                        a.download = 'debug_styled.jpg';
                        a.click();
                      }} style={{fontSize:10,color:'rgba(242,226,192,0.5)',background:'none',border:'1px solid rgba(242,226,242,0.15)',padding:'3px 8px',cursor:'pointer',borderRadius:3}}>
                        ↓ 入画
                      </button>
                      <button onClick={() => {
                        // Draw styledUrl with cropBox overlay onto a canvas, then download
                        const img = new Image();
                        img.onload = () => {
                          const c = document.createElement('canvas');
                          c.width = img.width; c.height = img.height;
                          const ctx = c.getContext('2d');
                          ctx.drawImage(img, 0, 0);
                          if (cropBox) {
                            ctx.strokeStyle = '#e24b4a';
                            ctx.lineWidth = Math.round(img.width * 0.004);
                            ctx.strokeRect(
                              cropBox.x * img.width, cropBox.y * img.height,
                              cropBox.w * img.width, cropBox.h * img.height
                            );
                          }
                          const a = document.createElement('a');
                          a.href = c.toDataURL('image/jpeg', 0.92);
                          a.download = 'debug_styled_box.jpg';
                          a.click();
                        };
                        img.src = styledUrl;
                      }} style={{fontSize:10,color:'rgba(242,226,192,0.5)',background:'none',border:'1px solid rgba(242,226,242,0.15)',padding:'3px 8px',cursor:'pointer',borderRadius:3}}>
                        ↓ 入画 (含裁剪框)
                      </button>
                    </>)}
                    {imgs?.[painting?.id] && figure && (() => {
                      const reg = FACE_REGIONS[painting?.id]?.[figure?.id];
                      if (!reg) return null;
                      return (
                        <button onClick={() => {
                          // Crop original painting to figure region and download
                          const img = new Image();
                          img.crossOrigin = 'anonymous';
                          img.onload = () => {
                            const sx = reg.x * img.width,  sy = reg.y * img.height;
                            const sw = reg.w * img.width,  sh = reg.h * img.height;
                            const c = document.createElement('canvas');
                            c.width = Math.round(sw); c.height = Math.round(sh);
                            c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
                            const a = document.createElement('a');
                            a.href = c.toDataURL('image/jpeg', 0.92);
                            a.download = 'debug_figure.jpg';
                            a.click();
                          };
                          img.src = imgs[painting.id];
                        }} style={{fontSize:10,color:'rgba(242,226,192,0.5)',background:'none',border:'1px solid rgba(242,226,192,0.15)',padding:'3px 8px',cursor:'pointer',borderRadius:3}}>
                          ↓ 原画人物
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function RuHua() {
  const [screen, setScreen] = useState('home');
  const [painting, setPainting] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentIsGate, setConsentIsGate] = useState(false); // true = triggered by 入画, false = first load
  const [showConsentNudge, setShowConsentNudge] = useState(false); // "需要同意才能继续"
  const [pendingGenerate, setPendingGenerate] = useState(null);

  const hasConsent = () => typeof window !== 'undefined' && localStorage.getItem('ruhua_ai_consent') === 'true';

  const triggerGenerate = (generateFn) => {
    if (hasConsent()) { generateFn(); return; }
    setPendingGenerate(() => generateFn);
    setConsentIsGate(true);
    setShowConsentModal(true);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('ruhua_ai_consent')) {
      setShowConsentModal(true);
    }
  }, []);
  const [figure, setFigure] = useState(null);
  const [selfie, setSelfie] = useState(null);

  const [faceBounds, setFaceBounds] = useState(null);
  const [skipSelfie, setSkipSelfie] = useState(false);
  const [imgs, setImgs] = useState({});

  const { generate, status, outputUrl, styledUrl, cropBox, paintSampleBox, maskedFaceUrl, portraitCropUrl, faceBoundsBox, portraitLandmarks, profileUrl, error, reset: resetGen, fullReset, clearSelfieCache, clearStyledCache, hasCachedSelfie } = useGenerate();

  // Map status → processing step index (1-based, matches STEPS array)
  // Fresh selfie:  submitting(1) → styling(2) → compositing(3) → succeeded(4)
  // Cached selfie: submitting(1) → compositing(3) → succeeded(4)
  const STEP_FOR_STATUS = { submitting:1, styling:2, compositing:3, succeeded:4, failed:0 };
  const procStep = STEP_FOR_STATUS[status] ?? 1;

  // Fetch real painting thumbnails on mount
  useEffect(() => {
    PAINTINGS.forEach(p => {
      if (p.directImageUrl) {
        setImgs(prev => ({ ...prev, [p.id]: p.directImageUrl }));
        return;
      }
      if (p.commonsTitle) {
        // Use Wikimedia Commons imageinfo API with the known filename
        const encoded = encodeURIComponent(p.commonsTitle);
        fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encoded}&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`)
          .then(r => r.json())
          .then(d => {
            const pages = d.query?.pages;
            const page = pages && Object.values(pages)[0];
            const url = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
            if (url) setImgs(prev => ({ ...prev, [p.id]: url }));
          })
          .catch(() => {});
        return;
      }
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${p.wikiTitle}`)
        .then(r => r.json())
        .then(d => {
          const url = d.originalimage?.source || d.thumbnail?.source;
          if (url) setImgs(prev => ({ ...prev, [p.id]: url }));
        })
        .catch(() => {});
    });
  }, []);

  // Navigate when generation finishes or fails
  useEffect(() => {
    if (status === 'succeeded') setScreen('result');
    // On failure: stay on processing screen where error message is shown
    // Don't bounce back to selfie — confusing and loses context
  }, [status]);

  const reset = () => {
    setSelfie(null);
    setFaceBounds(null);
    clearSelfieCache();
    resetGen();
    setScreen('selfie');
  };

  return (
    <div style={{ background:C.bg, minHeight:'100vh', display:'flex', justifyContent:'center' }}>
      <style>{STYLES}</style>
      <div style={{ width:'100%', maxWidth:430, minHeight:'100vh', position:'relative', overflow:'hidden' }}>
        {screen === 'home'       && <HomeScreen onBegin={() => setScreen('gallery')} />}
        {screen === 'gallery'    && <GalleryScreen paintings={PAINTINGS} imgs={imgs}
                                      onSelect={p => { setPainting(p); setScreen('figure'); }}
                                      onBack={() => setScreen('home')} />}
        {screen === 'figure'     && <FigureScreen painting={painting} imgs={imgs}
                                      hasCachedSelfie={hasCachedSelfie(selfie)}
                                      onSelect={f => {
                                        setFigure(f);
                                        if (skipSelfie && selfie) {
                                          // Figure change flow — skip selfie, generate fresh
                                          setSkipSelfie(false);
                                          triggerGenerate(() => {
                                            setScreen('processing');
                                            generate({
                                              selfie,
                                              painting,
                                              figure: f,
                                              gender: f.gender || 'woman',
                                              styleImageUrl: imgs[painting.id],
                                              faceBounds,
                                            });
                                          });
                                        } else if (hasCachedSelfie(selfie)) {
                                          triggerGenerate(() => {
                                            setScreen('processing');
                                            generate({
                                              selfie,
                                              painting,
                                              figure: f,
                                              gender: f.gender || 'woman',
                                              styleImageUrl: imgs[painting.id],
                                              faceBounds,
                                            });
                                          });
                                        } else {
                                          setScreen('selfie');
                                        }
                                      }}
                                      onBack={() => setScreen('gallery')} />}
        {screen === 'selfie'     && <SelfieScreen painting={painting} figure={figure} imgs={imgs}
                                      onCaptured={(img, bounds) => { setSelfie(img); setFaceBounds(bounds); }}
                                      onRetake={() => clearSelfieCache()}
                                      onConfirmWithSelfie={(img) => {
                                        setSelfie(img);
                                        triggerGenerate(() => {
                                          setScreen('processing');
                                          generate({
                                            selfie: img, painting, figure,
                                            gender: figure?.gender || 'woman',
                                            styleImageUrl: imgs[painting.id],
                                            faceBounds,
                                          });
                                        });
                                      }}
                                      onConfirm={() => {
                                        triggerGenerate(() => {
                                          setScreen('processing');
                                          generate({
                                            selfie, painting, figure,
                                            gender: figure?.gender || 'woman',
                                            styleImageUrl: imgs[painting.id],
                                            faceBounds,
                                          });
                                        });
                                      }}
                                      onBack={() => setScreen('figure')} />}
        {screen === 'processing' && <ProcessingScreen step={procStep} painting={painting} imgs={imgs} styledUrl={styledUrl} error={error} onRetry={() => setScreen('selfie')} />}
        {screen === 'result'     && <ResultScreen painting={painting} figure={figure} imgs={imgs}
                                      generatedUrl={outputUrl}
                                      profileUrl={profileUrl}
                                      styledUrl={styledUrl}
                                      cropBox={cropBox}
                                      paintSampleBox={paintSampleBox}
                                      maskedFaceUrl={maskedFaceUrl}
                                      portraitCropUrl={portraitCropUrl}
                                      faceBoundsBox={faceBoundsBox}
                                      portraitLandmarks={portraitLandmarks}
                                      paintSampleBox={paintSampleBox}
                                      selfie={selfie}
                                      onReset={reset}
                                      onChangeFigure={() => {
                                        resetGen();
                                        setSkipSelfie(true);
                                        setScreen('figure');
                                      }}
                                      onNew={() => {
                                        // Keep styled face cache — switch painting, rerun compositing
                                        resetGen();
                                        setPainting(null);
                                        setFigure(null);
                                        setScreen('gallery');
                                      }} />}
      {showConsentNudge && (
        <div style={{
          position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)',
          background:'rgba(26,18,8,0.95)', border:`1px solid ${C.gold}44`,
          borderRadius:8, padding:'10px 20px', zIndex:9998,
          fontFamily:F.serif, fontSize:13, color:C.gold, whiteSpace:'nowrap',
        }} onClick={() => setShowConsentNudge(false)}>
          需要同意数据使用才能入画 · 点击关闭
        </div>
      )}
      {showConsentModal && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,0.88)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'24px',
        }}>
          <div style={{
            background:'#1a1208', border:`1px solid ${C.gold}`,
            borderRadius:12, padding:'28px 24px', maxWidth:380, width:'100%',
          }}>
            <div style={{ fontFamily:F.brush, fontSize:22, color:C.silk, marginBottom:14, textAlign:'center', letterSpacing:'.1em' }}>
              数据使用说明
            </div>
            <div style={{ fontFamily:F.serif, fontSize:13, color:C.silkDim, lineHeight:2, marginBottom:16 }}>
              <div>入画将使用您的自拍照片生成古典画风肖像。</div>
              <div style={{ marginTop:10 }}>
                <span style={{ color:C.silk }}>发送内容：</span>您的自拍照片<br/>
                <span style={{ color:C.silk }}>发送至：</span>aimlapi.com（AI图像生成服务）<br/>
                <span style={{ color:C.silk }}>用途：</span>生成肖像，处理后即删除
              </div>
              <div style={{ marginTop:10, color:C.silkFaint, fontSize:12 }}>
                Your selfie is sent to aimlapi.com to generate a portrait. It is processed transiently and not stored.
              </div>
            </div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkFaint, marginBottom:18 }}>
              详见隐私政策：ruhua.vercel.app/privacy
            </div>
            <button onClick={() => {
              localStorage.setItem('ruhua_ai_consent', 'true');
              setShowConsentModal(false);
              setShowConsentNudge(false);
              if (pendingGenerate) { pendingGenerate(); setPendingGenerate(null); }
            }} className="btn" style={{
              background:C.vermillion, color:'#f5e8c4',
              fontFamily:F.brush, fontSize:18, padding:'12px',
              letterSpacing:'.2em', width:'100%', marginBottom:10,
            }}>同意并继续</button>
            <button onClick={() => {
              setShowConsentModal(false);
              setPendingGenerate(null);
              if (consentIsGate) setShowConsentNudge(true);
            }} className="btn" style={{
              background:'transparent', color:C.silkDim,
              fontFamily:F.serif, fontSize:13, padding:'8px', width:'100%',
            }}>取消 · Cancel</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
