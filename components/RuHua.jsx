import { useState, useEffect, useRef, useCallback } from "react";
import { useGenerate } from '../hooks/useGenerate';

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

.tab-btn{cursor:pointer;border:none;background:none;transition:all .18s ease}
.tab-btn:hover{background:rgba(201,168,76,.05)!important}

::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(201,168,76,.25);border-radius:2px}
`;

// ─── Paintings Data ──────────────────────────────────────────────────────────

const PAINTINGS = [
  {
    id: 'qingming',
    wikiTitle: 'Along_the_River_During_the_Qingming_Festival',
    title: '清明上河图',
    sub: 'Along the River During Qingming Festival',
    dynasty: '北宋',
    dynastyFull: 'Northern Song Dynasty · c. 1085 CE',
    artist: '张择端',
    artistFull: '张择端 Zhang Zeduan',
    tagZh: '市井百态',
    tagEn: 'City Life',
    grad: 'linear-gradient(148deg,#2e200e 0%,#6a5228 22%,#b09060 48%,#7a6038 74%,#2e200e 100%)',
    color: '#b09060',
    figures: [
      { id:'scholar',  name:'行路客',  en:'Traveling Scholar',  pose:'Near-frontal', rec:true,  faceRegion:{ x:0.53, y:0.35, w:0.04, h:0.30, angle:0  } },
      { id:'merchant', name:'市井商人', en:'Market Merchant',    pose:'3/4 turn',     rec:false, faceRegion:{ x:0.62, y:0.32, w:0.04, h:0.30, angle:5  } },
      { id:'boatman',  name:'船夫',    en:'River Boatman',      pose:'Profile',      rec:false, faceRegion:{ x:0.44, y:0.40, w:0.04, h:0.28, angle:-8 } },
    ],
    youAre: '行路客 · Traveling Scholar',
    context: 'You stand in Bianjing (modern Kaifeng), the Northern Song capital at its glittering peak, on the eve of Qingming Festival. Silk merchants, fortune tellers, and children with kites crowd the banks of the Grand Canal. This 5-meter scroll is the most studied artwork in Chinese history.',
    scene: 'Returning from the imperial examinations, you pass through the Eastern Capital gate as spring blossoms line the canal banks — the whole city in restless, joyful motion around you.',
  },
  {
    id: 'hanxizai',
    wikiTitle: 'The_Night_Revels_of_Han_Xizai',
    title: '韩熙载夜宴图',
    sub: 'Night Revels of Han Xizai',
    dynasty: '五代',
    dynastyFull: 'Five Dynasties Period · c. 975 CE',
    artist: '顾闳中',
    artistFull: '顾闳中 Gu Hongzhong',
    tagZh: '宫廷夜宴',
    tagEn: 'Court Banquet',
    grad: 'linear-gradient(148deg,#10060300 0%,#100603 0%,#3a100a 24%,#6a2c16 50%,#4a1e0e 74%,#100603 100%)',
    color: '#8a4020',
    figures: [
      { id:'guest',  name:'宾客',    en:'Honored Guest',    pose:'Near-frontal', rec:true,  faceRegion:{ x:0.68, y:0.18, w:0.09, h:0.22, angle:5  } },
      { id:'host',   name:'韩熙载',  en:'Han Xizai (Host)', pose:'Near-frontal', rec:true,  faceRegion:{ x:0.33, y:0.20, w:0.12, h:0.20, angle:-3 } },
      { id:'dancer', name:'舞伎',    en:'Court Dancer',     pose:'Profile',      rec:false, faceRegion:{ x:0.46, y:0.22, w:0.08, h:0.20, angle:-5 } },
    ],
    youAre: '宾客 · Honored Guest',
    context: 'Emperor Li Yu secretly sent painter Gu Hongzhong to spy on Han Xizai\'s private banquets. The result: five scenes of music, dance, and political melancholy in one of history\'s most intimate court scrolls.',
    scene: 'Seated beside Han Xizai by lamplight, you watch a pipa performance as the doomed Southern Tang court burns brilliant and brief around you.',
  },
  {
    id: 'bunianta',
    wikiTitle: 'Emperor_Taizong_Receiving_the_Tibetan_Envoy',
    title: '步辇图',
    sub: 'Emperor Taizong Receives the Tibetan Envoy',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 641 CE',
    artist: '阎立本',
    artistFull: '阎立本 Yan Liben',
    tagZh: '帝国外交',
    tagEn: 'Imperial Diplomacy',
    grad: 'linear-gradient(148deg,#1c1006 0%,#5a3818 24%,#a87040 50%,#7a5028 74%,#1c1006 100%)',
    color: '#a87040',
    figures: [
      { id:'official', name:'唐朝官员', en:'Tang Court Official', pose:'Near-frontal', rec:true,  faceRegion:{ x:0.46, y:0.18, w:0.09, h:0.28, angle:3  } },
      { id:'envoy',    name:'吐蕃使节', en:'Tibetan Envoy',       pose:'3/4 turn',     rec:false, faceRegion:{ x:0.32, y:0.20, w:0.09, h:0.28, angle:-5 } },
    ],
    youAre: '唐朝官员 · Imperial Official',
    context: 'Emperor Taizong receives Ludongzan, envoy of Tibetan king Songtsen Gampo, to negotiate the marriage of Princess Wencheng — a union that would shape Sino-Tibetan relations for centuries.',
    scene: 'You stand at court as history turns. Silk and ceremony seal two empires together; the envoy bows before the Son of Heaven, and the age of Tang reaches its imperial apex.',
  },
  {
    id: 'qianli',
    wikiTitle: 'A_Thousand_Li_of_Rivers_and_Mountains',
    title: '千里江山图',
    sub: 'A Thousand Li of Rivers and Mountains',
    dynasty: '北宋',
    dynastyFull: 'Northern Song Dynasty · c. 1113 CE',
    artist: '王希孟',
    artistFull: '王希孟 Wang Ximeng',
    tagZh: '山河壮景',
    tagEn: 'Grand Landscape',
    grad: 'linear-gradient(148deg,#040f18 0%,#082a48 24%,#105878 50%,#0a3e30 74%,#040f18 100%)',
    color: '#105878',
    figures: [
      { id:'hermit',    name:'山中隐士', en:'Mountain Hermit',  pose:'Near-frontal', rec:true,  faceRegion:{ x:0.28, y:0.58, w:0.03, h:0.08, angle:0   } },
      { id:'fisherman', name:'江上渔夫', en:'River Fisherman',  pose:'Profile',      rec:false, faceRegion:{ x:0.65, y:0.62, w:0.03, h:0.07, angle:-10 } },
    ],
    youAre: '山中隐士 · Mountain Hermit',
    context: 'Painted by Wang Ximeng at 18 using precious azurite and malachite — his only surviving work. This 11-meter scroll depicts the entire Chinese empire in imagined blue-green splendor. Wang died before turning 20.',
    scene: 'You retreat from court politics to the blue-green mountains, seeking the Tao among peaks that stretch beyond any mortal eye — mist-veiled, eternal, indifferent to dynasty.',
  },
  {
    id: 'luoshen',
    wikiTitle: 'Nymph_of_the_Luo_River',
    title: '洛神赋图',
    sub: 'Goddess of the Luo River',
    dynasty: '东晋',
    dynastyFull: 'Eastern Jin Dynasty · c. 344–406 CE',
    artist: '顾恺之（传）',
    artistFull: '顾恺之（传）Gu Kaizhi (attrib.)',
    tagZh: '神话传说',
    tagEn: 'Mythology',
    grad: 'linear-gradient(148deg,#101622 0%,#263050 24%,#506888 50%,#384862 74%,#101622 100%)',
    color: '#506888',
    figures: [
      { id:'attendant', name:'随行侍从', en:"Poet's Attendant", pose:'Near-frontal', rec:true,  faceRegion:{ x:0.76, y:0.32, w:0.07, h:0.18, angle:-2 } },
      { id:'cao',       name:'曹植',     en:'Poet Cao Zhi',     pose:'3/4 turn',     rec:false, faceRegion:{ x:0.86, y:0.34, w:0.08, h:0.20, angle:-5 } },
    ],
    youAre: "随行侍从 · The Poet's Companion",
    context: "Based on Cao Zhi's poem of impossible love for the Luo River goddess. The scroll follows his encounter with Luo Zhen — ethereal beauty that cannot be held. One of China's oldest surviving narrative scrolls.",
    scene: "You witness the vision at the misty riverbank. The goddess Luo Zhen appears on the water — luminous, unreachable — then fades like a dream into the current before Cao Zhi can speak.",
  },
  {
    id: 'gongle',
    wikiTitle: 'Court_Ladies_Playing_Double_Sixes',
    title: '宫乐图',
    sub: 'Court Ladies Making Music',
    dynasty: '唐',
    dynastyFull: 'Tang Dynasty · c. 9th century CE',
    artist: '佚名',
    artistFull: '佚名 Anonymous',
    tagZh: '仕女雅集',
    tagEn: 'Court Ladies',
    grad: 'linear-gradient(148deg,#1a0814 0%,#562040 24%,#925068 50%,#6a3850 74%,#1a0814 100%)',
    color: '#925068',
    figures: [
      { id:'listener', name:'听乐仕女', en:'Lady of the Court',  pose:'Near-frontal', rec:true,  faceRegion:{ x:0.10, y:0.30, w:0.13, h:0.28, angle:0  } },
      { id:'musician', name:'琵琶仕女', en:'Pipa Musician',      pose:'3/4 turn',     rec:false, faceRegion:{ x:0.46, y:0.14, w:0.11, h:0.24, angle:-8 } },
      { id:'serving',  name:'侍女',     en:'Serving Attendant',  pose:'Near-frontal', rec:true,  faceRegion:{ x:0.85, y:0.28, w:0.10, h:0.24, angle:2  } },
    ],
    youAre: '听乐仕女 · Lady of the Tang Court',
    context: 'Ten Tang dynasty court ladies gather at a lacquered table — playing pipa, zither, and flute, or simply listening. Their full-figured forms and elaborate hairstyles embody the cosmopolitan aesthetic of Tang at its height.',
    scene: 'You recline at the banquet table in the imperial garden, osmanthus wine in hand, as evening music begins beneath a half-moon and flowering wisteria.',
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
      padding: '6px 0', marginBottom: 12,
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

function FigureScreen({ painting, imgs, onSelect, onBack }) {
  if (!painting) return null;
  const imgUrl = imgs?.[painting.id];
  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      {/* Hero — centered on first recommended figure if image available */}
      <div style={{
        background: imgUrl ? `url(${imgUrl}) center/cover` : painting.grad,
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

      {/* Figure selection */}
      <div style={{ padding:'24px 20px' }}>
        <div className="r3" style={{ fontFamily:F.brush, fontSize:26, color:C.silk, marginBottom:3 }}>
          选择角色
        </div>
        <div className="r4" style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.16em', marginBottom:20 }}>
          Choose your figure in the painting
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
          {painting.figures.map((fig, i) => (
            <div key={fig.id} className={`fig-opt r${i + 3}`} onClick={() => onSelect(fig)}
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
                <div style={{ fontFamily:F.latin, fontSize:12, color:C.silkDim }}>
                  {fig.en}
                </div>
              </div>
              <div style={{ textAlign:'right', marginLeft:12 }}>
                <div style={{ fontFamily:F.serif, fontSize:11, color: fig.rec ? C.gold : C.silkFaint, marginBottom:4 }}>
                  {fig.pose}
                </div>
                {fig.rec && (
                  <div style={{
                    background:C.vermillion, color:'#f5e8c4',
                    fontFamily:F.latin, fontSize:9,
                    padding:'2px 7px', letterSpacing:'.1em',
                  }}>
                    RECOMMENDED
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="r6" style={{ marginTop:20, padding:'12px 14px',
          border:`1px solid ${C.borderSub}`, background:'rgba(201,168,76,.04)' }}>
          <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, lineHeight:1.65 }}>
            💡 Near-frontal figures yield the most faithful style transfer.
            Profile figures may require a slight head tilt to match.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Selfie Screen ───────────────────────────────────────────────────────────

function SelfieScreen({ painting, figure, imgs, onConfirm, onCaptured, onRetake, onBack }) {
  const [camState, setCamState] = useState('starting'); // starting | live | counting | flash | done | error
  const [count, setCount] = useState(3);
  const [capturedImg, setCapturedImg] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Start front camera on mount
  useEffect(() => {
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
              ✓ 自拍已捕捉
            </div>
          )}
        </div>

        {/* Pose hint */}
        <div style={{ width:'100%', maxWidth:300, marginTop:11 }}>
          <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, lineHeight:1.65 }}>
            {figure?.rec
              ? '✓ Near-frontal pose — look slightly toward the camera for best results.'
              : `This figure is ${figure?.pose?.toLowerCase()} — tilt your head slightly to match.`}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ width:'100%', maxWidth:300, marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
          {camState !== 'done' ? (
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
          ) : (
            <>
              <button onClick={onConfirm} className="btn" style={{
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
                重拍
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Processing Screen ───────────────────────────────────────────────────────

const STEPS = [
  { zh:'分析面部特征', en:'Analyzing facial structure'   },
  { zh:'学习笔墨风格', en:'Learning brushstroke language' },
  { zh:'风格迁移渲染', en:'Applying style transfer'       },
  { zh:'合成入画',     en:'Compositing into the scroll'  },
];

function ProcessingScreen({ step, painting, imgs, styledUrl, error }) {
  const imgUrl = styledUrl || imgs?.[painting?.id];
  return (
    <div style={{
      minHeight:'100vh',
      background: imgUrl ? `url(${imgUrl}) center/cover` : (painting?.grad || C.bg),
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
          <div style={{ fontFamily:F.serif, fontSize:13, color:C.silkDim, lineHeight:1.7 }}>
            {error}
          </div>
          <div style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, marginTop:8 }}>
            Returning to selfie screen…
          </div>
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

function ResultScreen({ painting, figure, imgs, generatedUrl, profileUrl, onReset, onNew, onChangeFigure }) {
  const [tab, setTab] = useState('scene');
  const imgUrl = generatedUrl || imgs?.[painting?.id];
  const region = figure?.faceRegion;

  // Profile crop background — use server-side cropped image if available,
  // otherwise fall back to CSS zoom of the full composited image
  function profileBg(containerPx) {
    if (profileUrl) return {
      backgroundImage: `url(${profileUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
    // Fallback: CSS zoom (less reliable but better than nothing)
    if (!region || !imgUrl) return {
      background: imgUrl ? `url(${imgUrl}) center/cover` : painting?.grad,
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

  // Center the hero image on the face region so it's always visible
  // For wide scrolls (background: cover), default center crops out faces at edges
  const faceXPct = region ? `${Math.round((region.x + region.w / 2) * 100)}%` : 'center';
  const faceYPct = region ? `${Math.round((region.y + region.h / 2) * 100)}%` : 'center';
  const heroBgPos = `${faceXPct} ${faceYPct}`;

  // With background centered on face, the marker is always near center horizontally
  // Vertical position maps the face center within the hero's paddingTop:62% container
  const markerLeft = '50%';
  const markerTop  = region ? `${Math.round((region.y + region.h / 2) * 100)}%` : '38%';

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      {/* Hero — full composited painting, centered on face */}
      <div style={{
        background: imgUrl ? `url(${imgUrl}) ${heroBgPos}/cover` : painting?.grad,
        position:'relative', paddingTop:'62%', overflow:'hidden',
        transition:'background .4s ease',
      }}>
        <div style={{ position:'absolute', inset:0 }}>
          {/* Gradient overlay bottom only — don't obscure the painting */}
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(to bottom, transparent 50%, rgba(12,9,4,.7) 100%)' }} />

          {/* Dynamic "你在此处" marker at actual face position */}
          <div style={{
            position:'absolute',
            left: markerLeft,
            top: markerTop,
            transform:'translate(-50%, -100%)',
            textAlign:'center',
            pointerEvents:'none',
          }}>
            <div style={{
              background:C.vermillion, color:'#f5e8c4',
              fontFamily:F.serif, fontSize:10,
              padding:'2px 9px', letterSpacing:'.1em', whiteSpace:'nowrap',
              marginBottom:4,
            }}>
              你在此处
            </div>
            <div style={{ width:1.5, height:16, background:C.vermillion, margin:'0 auto', opacity:.85 }} />
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
      <div style={{ display:'flex', background:C.card, borderBottom:`1px solid ${C.border}` }}>
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
            <div style={{ fontFamily:F.serif, fontSize:13, color:C.silkDim, lineHeight:1.85, marginBottom:18 }}>
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

            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkFaint, marginBottom:20 }}>
              圆形头像 · 微信 · 微博
            </div>

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

            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkFaint }}>
              方形头像 · Instagram · 小红书
            </div>
          </div>
        )}

        {/* ── 背景 tab ── */}
        {tab === 'history' && (
          <div className="fade-a">
            <div style={{ fontFamily:F.brush, fontSize:24, color:C.silk, marginBottom:3 }}>
              历史背景
            </div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.gold, marginBottom:16 }}>
              {painting?.sub}
            </div>

            <div style={{ background:C.card, border:`1px solid ${C.border}`, padding:16, marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ fontFamily:F.brush, fontSize:22, color:C.silk }}>{painting?.title}</div>
                  <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim }}>{painting?.artistFull}</div>
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
                  <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, marginBottom:3 }}>朝代</div>
                  <div style={{ fontFamily:F.serif, fontSize:12, color:C.silk }}>{painting?.dynastyFull}</div>
                </div>
                <div>
                  <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, marginBottom:3 }}>画家</div>
                  <div style={{ fontFamily:F.serif, fontSize:12, color:C.silk }}>{painting?.artistFull}</div>
                </div>
              </div>
              <div style={{ height:1, background:C.border, marginBottom:12 }} />
              <div style={{ fontFamily:F.serif, fontSize:13, color:C.silkDim, lineHeight:1.8 }}>
                {painting?.context}
              </div>
            </div>

            <div style={{ background:'rgba(191,36,41,.07)', border:`1px solid rgba(191,36,41,.28)`, padding:'14px 16px' }}>
              <div style={{ fontFamily:F.serif, fontSize:10, color:C.vermillion, letterSpacing:'.1em', marginBottom:6 }}>
                你扮演的角色
              </div>
              <div style={{ fontFamily:F.brush, fontSize:20, color:C.silk, marginBottom:6 }}>
                {painting?.youAre}
              </div>
              <div style={{ fontFamily:F.serif, fontSize:13, color:C.silkDim, lineHeight:1.75 }}>
                {painting?.scene}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ marginTop:26, display:'flex', flexDirection:'column', gap:10 }}>
          <button className="btn" style={{
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
        </div>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function RuHua() {
  const [screen, setScreen] = useState('home');
  const [painting, setPainting] = useState(null);
  const [figure, setFigure] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [faceBounds, setFaceBounds] = useState(null);
  const [imgs, setImgs] = useState({});

  const { generate, status, outputUrl, styledUrl, profileUrl, error, reset: resetGen, fullReset, clearSelfieCache } = useGenerate();

  // Map status → processing step
  const STEP_FOR_STATUS = { submitting:1, styling:2, compositing:4, succeeded:4, failed:0 };
  const procStep = STEP_FOR_STATUS[status] ?? 1;

  // Fetch real painting thumbnails from Wikipedia API on mount
  useEffect(() => {
    PAINTINGS.forEach(p => {
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
    if (status === 'failed')    setScreen('selfie');
  }, [status]);

  const reset = () => {
    setScreen('home');
    setPainting(null);
    setFigure(null);
    setSelfie(null);
    setFaceBounds(null);
    fullReset();  // clears styled cache too — new selfie required
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
                                      onSelect={f => { setFigure(f); setScreen('selfie'); }}
                                      onBack={() => setScreen('gallery')} />}
        {screen === 'selfie'     && <SelfieScreen painting={painting} figure={figure} imgs={imgs}
                                      onCaptured={(img, bounds) => { setSelfie(img); setFaceBounds(bounds); }}
                                      onRetake={() => clearSelfieCache()}
                                      onConfirm={() => {
                                        setScreen('processing');
                                        generate({
                                          selfie,
                                          painting,
                                          figure,
                                          styleImageUrl: imgs[painting.id],
                                          faceBounds,
                                        });
                                      }}
                                      onBack={() => setScreen('figure')} />}
        {screen === 'processing' && <ProcessingScreen step={procStep} painting={painting} imgs={imgs} styledUrl={styledUrl} error={error} />}
        {screen === 'result'     && <ResultScreen painting={painting} figure={figure} imgs={imgs}
                                      generatedUrl={outputUrl}
                                      profileUrl={profileUrl}
                                      onReset={reset}
                                      onChangeFigure={() => {
                                        // Keep styled face cache — only rerun compositing
                                        resetGen();
                                        setScreen('figure');
                                      }}
                                      onNew={() => {
                                        // Keep styled face cache — switch painting, rerun compositing
                                        resetGen();
                                        setPainting(null);
                                        setFigure(null);
                                        setScreen('gallery');
                                      }} />}
      </div>
    </div>
  );
}
