import { useState, useEffect, useRef, useCallback } from "react";
import { useGenerate, loadLastSelfie } from '../hooks/useGenerate';
import { FACE_REGIONS } from '../lib/faceRegions';
import { checkSelfieFace } from '../lib/detectFaceClient';
import PaywallModal from '../components/PaywallModal';
import { configurePurchases, getCreditsBalance, getCreditProducts, getAppUserID, invalidateCreditsCache, grantFreeCredits } from '../lib/purchases';
import { hasClaimedFreeCredits, markFreeCreditsClaimed, resetFreeCreditsFlag, getLastKnownAppUserID, setLastKnownAppUserID } from '../lib/deviceStorage';
import { PAINTINGS, CATEGORIES, featuredPaintings } from '../lib/paintings';

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

.hscroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;scrollbar-width:none}
.hscroll::-webkit-scrollbar{display:none}
.hscroll>*{scroll-snap-align:start;flex-shrink:0}

::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(201,168,76,.25);border-radius:2px}
`;

// ─── Shared Components ───────────────────────────────────────────────────────

// Tablet layout: the app was laid out for phones only (a 430px column), so on
// an iPad it sat in a narrow strip with empty sides. At iPad widths, widen the
// column and use more grid columns; phones are unchanged.
const WIDE_MIN = 744;
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const update = () => setWide(window.innerWidth >= WIDE_MIN);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return wide;
}

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
        {PAINTINGS.length} paintings · historically grounded · social-ready
      </div>

      <div className="r6" style={{ marginTop:36, width:'100%' }}><Divider /></div>

      {/* Small footnote */}
      <div style={{ marginTop:18, display:'flex', gap:16, alignItems:'center', opacity:.35 }}>
        {/* Dynasties in the collection, oldest first (derived, so it stays current). */}
        {['唐','五代','宋','北宋','南宋','元','明','清'].filter(d => PAINTINGS.some(p => p.dynasty === d)).map(d => (
          <div key={d} style={{ fontFamily:F.serif, fontSize:10, color:C.silk }}>{d}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Gallery Screen ──────────────────────────────────────────────────────────

// "?today=2026-12-15" previews the gallery on another date (season / new row).
function galleryToday() {
  const q = new URLSearchParams(window.location.search).get('today');
  const d = q && new Date(q + 'T00:00:00');
  return d && !isNaN(d) ? d : new Date();
}

function PaintingCard({ p, img, badge, badgeHot, onSelect, className = '', style }) {
  const n = p.figures.length;
  return (
    <div className={`card-h ${className}`} onClick={() => onSelect(p)}
      style={{
        borderRadius:5, overflow:'hidden',
        border:`1px solid ${C.border}`,
        background: img ? `url(${img}) center/cover` : p.grad,
        aspectRatio:'3/4',
        position:'relative',
        display:'flex', flexDirection:'column', justifyContent:'flex-end',
        transition:'background .4s ease',
        ...style,
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
          background: badgeHot ? C.vermillion : 'rgba(12,9,4,.72)',
          border:`1px solid ${badgeHot ? 'rgba(255,255,255,.12)' : C.border}`,
          color: badgeHot ? '#f5e8c4' : C.gold,
          fontFamily:F.serif, fontSize:9,
          padding:'2px 7px', letterSpacing:'.08em',
        }}>
          {badge}
        </div>
      </div>

      {/* Info */}
      <div style={{ position:'relative', padding:'10px 10px 9px' }}>
        <div style={{ fontFamily:F.brush, fontSize:19, color:C.silk, lineHeight:1.15, marginBottom:3 }}>
          {p.title}
        </div>
        <div style={{ fontFamily:F.latin, fontSize:9, color:C.silkDim, letterSpacing:'.04em', marginBottom:5,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {p.sub}
        </div>
        <div style={{ fontFamily:F.serif, fontSize:10, color:C.gold, fontWeight:300 }}>
          {p.dynasty} · {p.artist}
        </div>
        <div style={{ fontFamily:F.serif, fontSize:9, color:C.silkDim, fontWeight:300, marginTop:2 }}>
          {n} 个角色 · {n} {n === 1 ? 'figure' : 'figures'}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ zh, en, count }) {
  return (
    <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:11 }}>
      <div style={{ fontFamily:F.brush, fontSize:19, color:C.silk }}>{zh}</div>
      <div style={{ fontFamily:F.latin, fontSize:10, color:C.silkFaint, letterSpacing:'.16em' }}>{en}</div>
      {count != null && (
        <div style={{ marginLeft:'auto', fontFamily:F.serif, fontSize:10, color:C.silkFaint }}>{count}</div>
      )}
    </div>
  );
}

function GalleryScreen({ paintings, imgs, onSelect, onBack }) {
  const wide = useWide();
  const [cat, setCat] = useState('all');
  const [{ season, items: featured }] = useState(() => featuredPaintings(paintings, galleryToday()));
  // Only offer categories that have paintings.
  const cats = CATEGORIES.filter(c => paintings.some(p => p.categories?.includes(c.id)));
  const shown = cat === 'all' ? paintings : paintings.filter(p => p.categories?.includes(cat));
  const activeCat = CATEGORIES.find(c => c.id === cat);
  const pad = wide ? 36 : 18;
  const hasNew = featured.some(p => p.season !== season?.id);
  const rowZh = season ? (hasNew ? `${season.zh} · 新上` : season.zh) : '新上';
  const rowEn = season ? (hasNew ? `${season.en} & New` : season.en) : 'New';

  const chip = (id, zh, en) => {
    const on = cat === id;
    return (
      <button key={id} className="tab-btn" onClick={() => setCat(id)} style={{
        padding:'6px 13px 5px', borderRadius:3,
        border:`1px solid ${on ? 'rgba(201,168,76,.6)' : C.border}`,
        background: on ? C.goldMid : 'transparent',
        textAlign:'center', lineHeight:1.2,
      }}>
        <div style={{ fontFamily:F.serif, fontSize:13, color: on ? C.silk : C.silkDim, whiteSpace:'nowrap' }}>{zh}</div>
        <div style={{ fontFamily:F.latin, fontSize:8.5, color: on ? C.gold : C.silkFaint, letterSpacing:'.06em', whiteSpace:'nowrap' }}>{en}</div>
      </button>
    );
  };

  return (
    <div style={{ minHeight:'100vh', background:C.bg, padding: wide ? '40px 36px 48px' : '20px 18px 32px', overflowX:'hidden' }}>
      <div className="r0"><BackBtn onClick={onBack} /></div>
      <div className="r0" style={{ marginBottom:2 }}>
        <div style={{ fontFamily:F.brush, fontSize:34, color:C.silk }}>选择画作</div>
      </div>
      <div className="r1" style={{ marginBottom:22, fontFamily:F.latin, fontSize:12, color:C.silkFaint, letterSpacing:'.22em' }}>
        Choose Your Painting
      </div>

      {/* 当季 / 新上: this season's specials and recent arrivals; hidden when empty */}
      {featured.length > 0 && (
        <div className="r1" style={{ marginBottom:24 }}>
          <SectionLabel zh={rowZh} en={rowEn} />
          <div className="hscroll" style={{
            display:'flex', gap: wide ? 16 : 12,
            margin:`0 -${pad}px`, padding:`2px ${pad}px 8px`, scrollPaddingLeft:pad,
          }}>
            {featured.map(p => {
              const seasonal = season && p.season === season.id;
              return (
                <PaintingCard key={p.id} p={p} img={imgs[p.id]} onSelect={onSelect}
                  badge={seasonal ? `${season.zh} · ${season.en}` : '新上 · New'} badgeHot
                  style={{ width: wide ? 230 : 'min(46vw, 180px)' }} />
              );
            })}
          </div>
        </div>
      )}

      {/* Category chips */}
      <div className="r2 hscroll" style={{
        display:'flex', gap:8,
        margin:`0 -${pad}px 18px`, padding:`0 ${pad}px`, scrollPaddingLeft:pad,
      }}>
        {chip('all', '全部', 'All')}
        {cats.map(c => chip(c.id, c.zh, c.en))}
      </div>

      <div className="r2">
        <SectionLabel
          zh={activeCat ? activeCat.zh : '全部画作'}
          en={activeCat ? activeCat.en : 'All Paintings'}
          count={`${shown.length} 幅 · ${shown.length} ${shown.length === 1 ? 'painting' : 'paintings'}`} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns: wide ? 'repeat(3, 1fr)' : '1fr 1fr', gap: wide ? 18 : 13 }}>
        {shown.map((p, i) => (
          <PaintingCard key={`${cat}-${p.id}`} p={p} img={imgs[p.id]} onSelect={onSelect}
            badge={p.tagEn} className={`r${Math.min(i + 2, 6)}`} />
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
  const wide = useWide();
  if (!painting) return null;
  const imgUrl = imgs?.[painting.id];
  const [showBg, setShowBg] = useState(false);
  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      {/* Hero — centered on first recommended figure if image available */}
      <div style={{
        background: imgUrl ? `url(${imgUrl}) ${painting?.bgPosition || "center"}/cover` : painting.grad,
        padding: wide ? '120px 36px 40px' : '52px 22px 28px', position:'relative', overflow:'hidden',
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

      <div style={{ padding: wide ? '32px 36px' : '24px 20px' }}>
        {!showBg ? (<>
          <div className="r3" style={{ fontFamily:F.brush, fontSize:26, color:C.silk, marginBottom:3 }}>
            选择角色
          </div>
          <div className="r4" style={{ fontFamily:F.latin, fontSize:11, color:C.silkFaint, letterSpacing:'.16em', marginBottom:20 }}>
            Choose your figure in the painting
          </div>

          <div style={wide
            ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }
            : { display:'flex', flexDirection:'column', gap:11 }}>
            {painting.figures.map((fig, i) => {
              const figRegion = FACE_REGIONS[painting.id]?.[fig.id];
              if (fig.disabled || figRegion?.disabled) return null;
              return (<div key={fig.id} className={`fig-opt r${i + 3}`} onClick={() => onSelect(fig)}
                style={{
                  border:'1px solid rgba(201,168,76,.38)',
                  background: C.goldFaint,
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
  const wide = useWide();
  const colW = wide ? 420 : 300;
  const lastSelfie = loadLastSelfie();
  const [camState, setCamState] = useState(lastSelfie ? 'done' : 'starting');
  const [count, setCount] = useState(3);
  const [capturedImg, setCapturedImg] = useState(lastSelfie || null);
  // No-face guard: 'checking' | 'ok' | 'none' | 'small'. Blocks 入画 (and the
  // Seedream call + credit behind it) when the photo has no usable face.
  const [faceCheck, setFaceCheck] = useState('checking');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!capturedImg) return;
    let live = true;
    setFaceCheck('checking');
    checkSelfieFace(capturedImg).then(r => { if (live) setFaceCheck(r.ok ? 'ok' : r.reason); });
    return () => { live = false; };
  }, [capturedImg]);
  const faceBlocked = faceCheck === 'none' || faceCheck === 'small';

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
              {figure?.name}{figure?.nameEn ? ` · ${figure.nameEn}` : ''}
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
          width:'100%', maxWidth:colW, aspectRatio:'3/4',
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
              background:'rgba(12,9,4,.75)', border:`1px solid ${faceBlocked ? C.vermillion : C.gold}`,
              color: faceBlocked ? C.vermillion : C.gold, fontFamily:F.serif, fontSize:11,
              padding:'4px 14px', letterSpacing:'.12em', whiteSpace:'nowrap',
              zIndex:5,
            }}>
              {faceBlocked ? '✕ 未检测到人脸' : capturedImg === lastSelfie ? '↩ 上次自拍' : '✓ 自拍已捕捉'}
            </div>
          )}
        </div>

        {/* Pose hint */}
        <div style={{ width:'100%', maxWidth:colW, marginTop:11 }}>
          {camState === 'done' && faceBlocked ? (
            <div style={{ fontFamily:F.serif, fontSize:12, color:C.vermillion, lineHeight:1.65 }}>
              {faceCheck === 'small'
                ? '脸离镜头太远了，请靠近一些、正对镜头重拍'
                : '没有检测到人脸，请正对镜头、在光线充足处重拍'}
              <div style={{ fontFamily:F.latin, fontSize:10, color:C.silkFaint }}>
                {faceCheck === 'small' ? 'Your face is too small in the photo — move closer and retake.' : 'No face detected — face the camera in good light and retake.'}
              </div>
            </div>
          ) : (
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim, lineHeight:1.65 }}>
              ✓ 请保持正面朝向镜头以获得最佳效果
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ width:'100%', maxWidth:colW, marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
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
              <button
                disabled={faceCheck !== 'ok'}
                onClick={() => { if (faceCheck !== 'ok') return; capturedImg === lastSelfie ? onConfirmWithSelfie(lastSelfie) : onConfirm(); }}
                className="btn" style={{
                background: faceCheck === 'ok' ? C.vermillion : 'rgba(191,36,41,.3)', color:'#f5e8c4',
                fontFamily:F.brush, fontSize:20, padding:'14px', letterSpacing:'.35em',
                boxShadow: faceCheck === 'ok' ? `0 4px 22px rgba(191,36,41,.32)` : 'none',
                cursor: faceCheck === 'ok' ? 'pointer' : 'default',
              }}>
                {faceCheck === 'checking' ? '检测中…' : '入画 →'}
              </button>
              <button onClick={handleRetake} className="btn" style={{
                background:'transparent', border:`1px solid ${C.border}`,
                color:C.silkDim, fontFamily:F.serif, fontSize:14, padding:'12px',
              }}>
                {capturedImg === lastSelfie ? '重新拍摄' : '重拍'}
              </button>

              {/* DEBUG: upload from photo library — enable with localStorage.setItem('ruhua_debug','true') in console */}
              {typeof window !== 'undefined' && localStorage.getItem('ruhua_debug') === 'true' && (
                <label style={{
                  fontFamily:F.serif, fontSize:12, color:C.silkDim,
                  border:`1px solid ${C.border}`, padding:'8px 16px',
                  cursor:'pointer', textAlign:'center', marginTop:4,
                  display:'block', borderRadius:4,
                }}>
                  📁 从相册选择（调试用）
                  <input type="file" accept="image/*" style={{ display:'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const dataUrl = ev.target.result;
                        setCapturedImg(dataUrl);
                        setCamState('done');
                        onCaptured(dataUrl);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
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
  const wide = useWide();
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

      {!error && <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth: wide ? 440 : 320, textAlign:'center' }}>
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
  const wide = useWide();
  const circleSz = wide ? 280 : 196, squareSz = wide ? 260 : 180;
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
                {figure?.nameEn}
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
              width:circleSz, height:circleSz, borderRadius:'50%',
              ...profileBg(circleSz),
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
              width:squareSz, height:squareSz,
              ...profileBg(squareSz),
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
  const wide = useWide();
  const [screen, setScreen] = useState('home');
  const [painting, setPainting] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentIsGate, setConsentIsGate] = useState(false); // true = triggered by 入画, false = first load
  const [showConsentNudge, setShowConsentNudge] = useState(false); // "需要同意才能继续"
  const [pendingGenerate, setPendingGenerate] = useState(null);

  // Credits / paywall — same gate pattern as consent above, checked right
  // after consent in triggerGenerate. NOTE: this is a client-side UX check
  // only. The real deduction (and the real "can this user generate" check)
  // happens server-side; this just avoids showing generation as available
  // when we already know the balance is 0, and avoids wasting a Seedream
  // call that the server would reject anyway.
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [creditProducts, setCreditProducts] = useState([]);
  const [purchasesReady, setPurchasesReady] = useState(false);

  const refreshCredits = async () => {
    // Always invalidate first -- a server-side deduction (the
    // deductCredit() call in pages/api/composite.js, via the REST API
    // directly) is invisible to the client SDK's local cache, since no
    // in-app purchase/restore event occurred to trigger a refresh on its
    // own. Baking this in here means every caller gets genuinely fresh
    // data without each call site needing to remember to invalidate
    // first -- this bit us once already (see the launch effect below,
    // which used to duplicate this call before it lived here).
    await invalidateCreditsCache();
    const balance = await getCreditsBalance();
    setCreditsBalance(balance);
    return balance;
  };

  useEffect(() => {
    (async () => {
      const ok = await configurePurchases();
      setPurchasesReady(ok);
      if (ok) {
        // Force a fresh read on launch rather than trusting whatever the
        // SDK's local cache already has -- several confirmed purchases
        // happened during earlier broken sessions (pre Purchases.then()
        // fix, pre credential fix) where the internal invalidate call at
        // the end of purchaseCredits() may never have actually run,
        // potentially leaving this device's local cache stuck on a stale
        // value ever since. Cheap to always do on launch, not just after
        // an in-app purchase/restore event.
        await invalidateCreditsCache();

        const [balance, products, appUserID] = await Promise.all([
          getCreditsBalance(),
          getCreditProducts(),
          getAppUserID(),
        ]);
        setCreditsBalance(balance);
        setCreditProducts(products);
        const isDebug = typeof window !== 'undefined' && localStorage.getItem('ruhua_debug') === 'true';
        if (isDebug) {
          // Compare this against the App User ID shown in RevenueCat's
          // Customers page to confirm this device is reading the same
          // customer record you're looking at in the dashboard.
          console.log('[purchases debug] appUserID:', appUserID, '| balance:', balance);
        }

        // One-time free credit grant for new users, so the first thing
        // anyone sees isn't a paywall with nothing to try first. This
        // fires for anyone who's never had this Keychain flag set --
        // that includes a genuinely brand-new install, but ALSO an
        // existing user updating from a pre-credits version (v1.0/v1.1),
        // since Purchases.configure() was never called for them before
        // and none of these Keychain keys exist yet on their device
        // either. That's intentional, not a bug: an existing user
        // updating gets treated the same as a new one and receives the
        // same free credits, a graceful transition rather than an
        // immediate paywall on their very next open.
        //
        // Gated by a Keychain flag (lib/deviceStorage.js), not
        // localStorage -- localStorage gets wiped on app deletion, which
        // would let anyone reset their free grant just by reinstalling.
        // Keychain survives deletion on the same device, same pattern
        // used for this exact problem in VetKeeper/WarrantyKeeper
        // (UsageTracker.swift there).
        //
        // Two independent layers of protection here, not redundant:
        // - This Keychain check is what actually stops a same-device
        //   reinstall from re-triggering the grant.
        // - The deterministic per-appUserID idempotency key in
        //   pages/api/grant-free-credits.js is what guarantees RevenueCat
        //   itself never double-grants to one customer record, covering
        //   races/retries within a single install that this flag alone
        //   wouldn't catch (e.g. a Keychain write that fails silently).
        //
        // Neither layer creates cross-device identity -- a different
        // device, or this same device with iCloud Keychain sync off
        // (the default, and what this app uses), starts fresh. That's
        // accepted, not a bug -- see the comments in
        // pages/api/grant-free-credits.js and lib/deviceStorage.js for
        // the full reasoning.
        //
        // IMPORTANT ORDERING: this runs AFTER the getCreditsBalance()
        // call above, not before. An earlier version called this first,
        // right after configurePurchases() succeeds -- but that's only
        // local SDK configuration; it doesn't guarantee RevenueCat's
        // server has actually registered this customer yet. That's the
        // exact same race that caused real "Customer could not be found"
        // (404) errors in the credit migration code below before it was
        // fixed the same way -- this endpoint hit the identical failure
        // mode and was never reordered to match until now. A successful
        // getCreditsBalance() call above is genuine confirmation the
        // customer record already exists server-side.
        const alreadyClaimed = await hasClaimedFreeCredits();
        if (!alreadyClaimed) {
          const grantedOk = await grantFreeCredits();
          if (grantedOk) {
            await markFreeCreditsClaimed();
            await invalidateCreditsCache();
            const freshBalance = await getCreditsBalance();
            setCreditsBalance(freshBalance);
            if (isDebug) {
              console.log('[purchases debug] granted free credits, new balance:', freshBalance);
            }
          }
          // If it failed (network hiccup, etc.), deliberately don't mark
          // it claimed -- try again on the next launch rather than
          // silently losing the free grant forever.
        }

        // Credit migration across reinstall -- see the long comment in
        // lib/deviceStorage.js for why this exists: RevenueCat does not
        // transfer Virtual Currency balances automatically the way it
        // does for entitlements/subscriptions, so a same-device reinstall
        // would otherwise permanently orphan any unspent purchased
        // credits.
        //
        // IMPORTANT ORDERING: this runs AFTER the getCreditsBalance() call
        // above, not before. An earlier version ran this first, right
        // after getAppUserID() returns -- but getAppUserID() only
        // generates the ID LOCALLY; it doesn't guarantee RevenueCat's
        // server has actually registered that customer yet. That race
        // caused real "Customer could not be found" (404) errors when
        // migrate-credits tried to grant to a newAppUserID the server
        // didn't recognize yet. A successful getCreditsBalance() call
        // above is a genuine confirmation the customer record already
        // exists server-side (it just made a real network call for this
        // exact customer and got a real answer), so it's now safe to
        // attempt migration.
        //
        // NOTE: this migration logic itself always runs, regardless of
        // the debug flag below -- it's real production behavior, not a
        // testing aid. Only the console logging around it is gated.
        const lastKnownAppUserID = await getLastKnownAppUserID();
        if (appUserID && lastKnownAppUserID && lastKnownAppUserID !== appUserID) {
          try {
            const migrateRes = await fetch('/api/migrate-credits', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldAppUserID: lastKnownAppUserID, newAppUserID: appUserID }),
            });
            const migrateData = await migrateRes.json().catch(() => ({}));
            if (migrateData?.migrated > 0) {
              await invalidateCreditsCache();
              const freshBalance = await getCreditsBalance();
              setCreditsBalance(freshBalance);
              if (isDebug) {
                console.log('[purchases debug] migrated', migrateData.migrated, 'credits from previous install, new balance:', freshBalance);
              }
            }
          } catch (e) {
            console.warn('[purchases] credit migration request failed:', e);
            // Don't update the stored ID below if the request itself
            // failed outright -- retry the migration attempt on the next
            // launch rather than silently abandoning the old balance.
          }
        }
        if (appUserID) await setLastKnownAppUserID(appUserID);

        // TESTING ONLY, and only exposed under the same ruhua_debug flag
        // used elsewhere in this app (e.g. the hidden photo-library upload
        // button) -- call window.__resetFreeCredits() from Safari Web
        // Inspector's console to clear the Keychain flag, then reload the
        // page (or relaunch the app) to see the free-credits grant fire
        // again. Enable with localStorage.setItem('ruhua_debug','true')
        // in console first, same as that existing debug feature.
        if (isDebug) {
          window.__resetFreeCredits = async () => {
            const ok = await resetFreeCreditsFlag();
            console.log('[debug] free credits flag reset:', ok, '-- reload to re-trigger the grant');
            return ok;
          };
        }
      }
    })();
  }, []);

  const hasConsent = () => typeof window !== 'undefined' && localStorage.getItem('ruhua_ai_consent') === 'true';
  const hasEnoughCredits = () => creditsBalance >= 1;

  // Runs after consent is confirmed. Client-side credits check is UX only
  // (see note above creditsBalance state) -- the server call in
  // generateFn() ultimately still has to succeed against the real,
  // server-side balance.
  const proceedToGenerate = (generateFn) => {
    if (purchasesReady && !hasEnoughCredits()) {
      setPendingGenerate(() => generateFn);
      setShowPaywallModal(true);
      return;
    }
    generateFn();
  };

  const triggerGenerate = (generateFn) => {
    if (!hasConsent()) {
      setPendingGenerate(() => generateFn);
      setConsentIsGate(true);
      setShowConsentModal(true);
      return;
    }
    proceedToGenerate(generateFn);
  };

  const handlePurchaseComplete = async () => {
    const balance = await refreshCredits();
    setShowPaywallModal(false);
    if (pendingGenerate && balance >= 1) {
      const fn = pendingGenerate;
      setPendingGenerate(null);
      fn();
    }
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

  const { generate, status, outputUrl, styledUrl, cropBox, paintSampleBox, maskedFaceUrl, portraitCropUrl, faceBoundsBox, portraitLandmarks, profileUrl, error, errorCode, reset: resetGen, fullReset, clearSelfieCache, clearStyledCache, hasCachedSelfie } = useGenerate();

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
    if (status === 'succeeded') {
      setScreen('result');
      // A credit was just spent server-side (see the deductCredit() gate
      // in pages/api/composite.js) but the client has no other way to
      // learn that -- balance was previously only ever refreshed on app
      // launch or right after a purchase, never after a successful
      // generation. Without this, the displayed balance silently drifts
      // from the real one until something else happens to trigger a
      // refetch (e.g. relaunching the app).
      refreshCredits();
    }
    // On failure: stay on processing screen where error message is shown
    // Don't bounce back to selfie — confusing and loses context
  }, [status]);

  // Server rejected for insufficient credits (the real gate — see
  // pages/api/composite.js) — surface the paywall directly rather than
  // making the user parse a raw error message. Also refresh balance,
  // since the client-side check that normally prevents this (see
  // proceedToGenerate) can be stale or bypassed.
  useEffect(() => {
    if (errorCode === 'insufficient_credits') {
      refreshCredits();
      setShowPaywallModal(true);
    }
  }, [errorCode]);

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
      <div style={{ width:'100%', maxWidth: wide ? 900 : 430, minHeight:'100vh', position:'relative', overflow:'hidden' }}>
        {purchasesReady && (
          <div
            onClick={() => setShowPaywallModal(true)}
            style={{
              position:'absolute', top:'max(env(safe-area-inset-top, 0px), 44px)', right:16, zIndex:50, marginTop:8,
              display:'flex', alignItems:'center', gap:6,
              background:'rgba(24,17,10,0.85)', border:`1px solid ${C.goldMid}`,
              borderRadius:999, padding:'6px 12px', cursor:'pointer',
            }}
          >
            <span style={{ fontFamily:F.brush, fontSize:15, color:C.gold }}>{creditsBalance}</span>
            <span style={{ fontFamily:F.serif, fontSize:11, color:C.silkDim }}>点数</span>
          </div>
        )}
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
                <span style={{ color:C.silk }}>用途：</span>仅用于生成肖像<br/>
                <span style={{ color:C.silk }}>保留：</span>服务商保留最长2个月，仅供调取结果，不人工查看，不用于训练；我们的服务器不保存<br/>
                <span style={{ color:C.silk }}>处理地：</span>部分请求（Seedream 模型）在中国境内处理
              </div>
              <div style={{ marginTop:10, color:C.silkFaint, fontSize:12 }}>
                Your selfie is sent to aimlapi.com to generate a portrait. The provider keeps request data for up to 2 months for retrieval only; it is not viewed or used for training, and our servers do not store it. Some requests (the Seedream model) are processed in China.
              </div>
            </div>
            <div style={{ fontFamily:F.serif, fontSize:11, color:C.silkFaint, marginBottom:18 }}>
              详见隐私政策：ruhua.vercel.app/privacy
            </div>
            <button onClick={() => {
              localStorage.setItem('ruhua_ai_consent', 'true');
              setShowConsentModal(false);
              setShowConsentNudge(false);
              if (pendingGenerate) {
                const fn = pendingGenerate;
                setPendingGenerate(null);
                proceedToGenerate(fn);
              }
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
      {showPaywallModal && (
        <PaywallModal
          products={creditProducts}
          balance={creditsBalance}
          onClose={() => {
            setShowPaywallModal(false);
            setPendingGenerate(null);
          }}
          onPurchaseComplete={handlePurchaseComplete}
        />
      )}
      </div>
    </div>
  );
}
