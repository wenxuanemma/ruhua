// pages/calibrate.jsx
// Calibration tool for the 6 paintings used in the 入画 app.
// Drag boxes to set face regions for each named figure.
// Output coordinates go into composite.js FACE_REGIONS.
// Visit http://localhost:3000/calibrate

import { useState, useEffect, useRef, useCallback } from 'react';

const C = {
  bg: '#0c0904', gold: '#c9a84c', red: '#e24b4a',
  text: '#f2e2c0', dim: 'rgba(242,226,192,0.45)',
};

const PAINTINGS = [
  { id:'qingming', title:'清明上河图', wikiTitle:'Along_the_River_During_the_Qingming_Festival',
    figures:[
      {id:'scholar',  name:'行路客'},
      {id:'merchant', name:'市井商人'},
      {id:'boatman',  name:'船夫'},
    ]},
  { id:'hanxizai', title:'韩熙载夜宴图', wikiTitle:'The_Night_Revels_of_Han_Xizai',
    figures:[
      {id:'guest',  name:'宾客'},
      {id:'host',   name:'韩熙载'},
      {id:'dancer', name:'舞伎'},
    ]},
  { id:'bunianta', title:'步辇图', wikiTitle:'Emperor_Taizong_Receiving_the_Tibetan_Envoy',
    figures:[
      {id:'official', name:'唐朝官员'},
      {id:'envoy',    name:'吐蕃使节'},
    ]},
  { id:'guoguo', title:'虢国夫人游春图', commonsTitle:'唐 张萱 虢国夫人游春图.jpg',
    figures:[
      {id:'lady',      name:'虢国夫人'},
      {id:'attendant', name:'侍女'},
      {id:'rider',     name:'骑马侍从'},
    ]},
  { id:'luoshen', title:'洛神赋图', wikiTitle:'Nymph_of_the_Luo_River',
    figures:[
      {id:'cao',       name:'曹植'},
      {id:'attendant', name:'随行侍从'},
    ]},
  { id:'gongle', title:'宫乐图', wikiTitle:'A_Palace_Concert',
    figures:[
      {id:'listener', name:'听乐仕女'},
      {id:'musician', name:'琵琶仕女'},
      {id:'serving',  name:'侍女'},
    ]},
];

// Figure colors so each role is visually distinct
const FIG_COLORS = ['#e24b4a','#c9a84c','#4ab4e2','#4ae27a','#e24ab4','#b44ae2'];

export default function Calibrate() {
  const [pIdx, setPIdx] = useState(0);
  const [vals, setVals] = useState({});   // {paintingId_figureId: {x,y,w,h}}
  const [imgUrl, setImgUrl] = useState('');
  const [imgSize, setImgSize] = useState({w:1,h:1});
  const [dragging, setDragging] = useState(null);
  const draggingRef = useRef(null);
  const valsRef = useRef({});
  const imgRef = useRef(null);

  useEffect(() => { valsRef.current = vals; }, [vals]);

  const painting = PAINTINGS[pIdx];

  // Load saved FACE_REGIONS from composite.js via API
  useEffect(() => {
    fetch('/api/face-regions')
      .then(r => r.json())
      .then(regions => {
        const loaded = {};
        for (const [paintingId, figures] of Object.entries(regions)) {
          for (const [figId, v] of Object.entries(figures)) {
            loaded[`${paintingId}_${figId}`] = { x:v.x, y:v.y, w:v.w, h:v.h };
          }
        }
        setVals(loaded);
      })
      .catch(() => {}); // silently fall back to hardcoded defaults
  }, []);

  // Fetch painting image when painting changes
  useEffect(() => {
    setImgUrl('');
    if (painting.commonsTitle) {
      const enc = encodeURIComponent(painting.commonsTitle);
      fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${enc}&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`)
        .then(r=>r.json()).then(d=>{
          const pages=d.query?.pages; const page=pages&&Object.values(pages)[0];
          const url=page?.imageinfo?.[0]?.thumburl||page?.imageinfo?.[0]?.url;
          if(url) setImgUrl(url);
        }).catch(()=>{});
    } else if (painting.wikiTitle) {
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${painting.wikiTitle}`)
        .then(r=>r.json()).then(d=>{
          const url=d.originalimage?.source||d.thumbnail?.source;
          if(url) setImgUrl(url);
        }).catch(()=>{});
    }
  }, [pIdx]);

  const onImgLoad = () => {
    if (imgRef.current) setImgSize({w:imgRef.current.offsetWidth, h:imgRef.current.offsetHeight});
  };

  const getVal = (figId) => {
    const key = `${painting.id}_${figId}`;
    return valsRef.current[key] || { x:0.45, y:0.45, w:0.10, h:0.10 }; // placeholder until API loads
  };

  const getMousePos = (e) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return {x:0,y:0};
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    };
  };

  // Window-level drag handlers using refs
  useEffect(() => {
    const onMove = (e) => {
      const drag = draggingRef.current;
      if (!drag || !imgRef.current) return;
      e.preventDefault();
      const pos = getMousePos(e);
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      const ob = drag.origBox;
      const key = `${drag.paintingId}_${drag.figId}`;

      setVals(prev => {
        const b = drag.type === 'move' ? {
          x: Math.max(0, Math.min(1-ob.w, ob.x+dx)),
          y: Math.max(0, Math.min(1-ob.h, ob.y+dy)),
          w: ob.w, h: ob.h,
        } : (() => {
          let {x,y,w,h} = ob;
          const c = drag.corner;
          if (c==='br') { w=Math.max(0.01,ob.w+dx); h=Math.max(0.01,ob.h+dy); }
          if (c==='bl') { x=ob.x+dx; w=Math.max(0.01,ob.w-dx); h=Math.max(0.01,ob.h+dy); }
          if (c==='tr') { y=ob.y+dy; w=Math.max(0.01,ob.w+dx); h=Math.max(0.01,ob.h-dy); }
          if (c==='tl') { x=ob.x+dx; y=ob.y+dy; w=Math.max(0.01,ob.w-dx); h=Math.max(0.01,ob.h-dy); }
          return { x:Math.max(0,x), y:Math.max(0,y), w:Math.min(1,w), h:Math.min(1,h) };
        })();
        return { ...prev, [key]: b };
      });
    };
    const onUp = () => {
      draggingRef.current = null;
      setDragging(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onImgMouseDown = useCallback((e) => {
    if (!imgRef.current) return;
    e.preventDefault();
    const pos = getMousePos(e);
    const CORNER_HIT = 0.025;

    for (let fi = 0; fi < painting.figures.length; fi++) {
      const fig = painting.figures[fi];
      const v = getVal(fig.id);
      const corners = [
        {name:'tl', x:v.x,     y:v.y},
        {name:'tr', x:v.x+v.w, y:v.y},
        {name:'bl', x:v.x,     y:v.y+v.h},
        {name:'br', x:v.x+v.w, y:v.y+v.h},
      ];
      for (const c of corners) {
        if (Math.abs(pos.x-c.x) < CORNER_HIT && Math.abs(pos.y-c.y) < CORNER_HIT) {
          const d = { type:'resize', paintingId:painting.id, figId:fig.id,
                      corner:c.name, startX:pos.x, startY:pos.y, origBox:{...v} };
          draggingRef.current = d; setDragging(d); return;
        }
      }
      if (pos.x>=v.x && pos.x<=v.x+v.w && pos.y>=v.y && pos.y<=v.y+v.h) {
        const d = { type:'move', paintingId:painting.id, figId:fig.id,
                    startX:pos.x, startY:pos.y, origBox:{...v} };
        draggingRef.current = d; setDragging(d); return;
      }
    }
  }, [painting]);

  // Build output
  const allOutput = PAINTINGS.map(p => {
    const figures = p.figures.map(f => {
      const key = `${p.id}_${f.id}`;
      const v = vals[key];
      if (!v) return `    ${f.id.padEnd(12)}: { /* loading... */ }`;
      return `    ${f.id.padEnd(12)}: { x:${v.x.toFixed(4)}, y:${v.y.toFixed(4)}, w:${v.w.toFixed(4)}, h:${v.h.toFixed(4)}, angle:0 },`;
    }).join('\n');
    return `  ${p.id}: {\n${figures}\n  },`;
  }).join('\n');

  const B = (active) => ({
    padding:'5px 12px', fontSize:13, cursor:'pointer', borderRadius:4,
    border:`1px solid ${active?C.gold:'rgba(201,168,76,0.3)'}`,
    background: active?'rgba(201,168,76,0.15)':'transparent',
    color: active?C.text:'rgba(242,226,192,0.55)',
  });

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'sans-serif',padding:24}}>
      <div style={{fontSize:22,marginBottom:8,color:C.gold}}>入画 · App Painting Calibration</div>
      <div style={{fontSize:11,color:C.dim,marginBottom:16}}>
        Drag boxes or corners to set face regions for each figure → copy output into composite.js
      </div>

      {/* Painting selector */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
        {PAINTINGS.map((p,i)=>(
          <button key={p.id} style={B(i===pIdx)} onClick={()=>setPIdx(i)}>{p.title}</button>
        ))}
      </div>

      {/* Image + boxes */}
      <div style={{position:'relative',display:'inline-block',marginBottom:12}}
           onMouseDown={onImgMouseDown}>
        {imgUrl
          ? <img ref={imgRef} src={imgUrl} alt={painting.title}
              style={{display:'block',maxWidth:'100%',maxHeight:500,
                      border:'1px solid rgba(201,168,76,0.2)',userSelect:'none'}}
              onLoad={onImgLoad} draggable={false}/>
          : <div style={{width:500,height:300,background:'#18110a',
                         border:'1px solid rgba(201,168,76,0.2)',display:'flex',
                         alignItems:'center',justifyContent:'center',color:C.dim}}>
              Loading painting…
            </div>
        }

        {/* Figure boxes */}
        {painting.figures.map((fig, fi) => {
          const v = getVal(fig.id);
          const color = FIG_COLORS[fi % FIG_COLORS.length];
          const isDragging = dragging?.figId === fig.id;
          const px = v.x * imgSize.w, py = v.y * imgSize.h;
          const pw = v.w * imgSize.w, ph = v.h * imgSize.h;
          return (
            <div key={fig.id} style={{
              position:'absolute', left:px, top:py, width:pw, height:ph,
              border:`2px solid ${color}`,
              background: isDragging ? `${color}22` : `${color}11`,
              boxSizing:'border-box', cursor:'move',
            }}>
              {/* Corner handles */}
              {[[0,0,'tl'],[pw-10,0,'tr'],[0,ph-10,'bl'],[pw-10,ph-10,'br']].map(([cx,cy,c])=>(
                <div key={c} style={{position:'absolute',left:cx,top:cy,
                  width:10,height:10,background:color,cursor:'nwse-resize',zIndex:10}}/>
              ))}
              {/* Label */}
              <div style={{position:'absolute',top:-18,left:0,
                background:color,color:'#000',fontSize:10,
                padding:'1px 5px',whiteSpace:'nowrap',borderRadius:2}}>
                {fig.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:16,marginBottom:16,flexWrap:'wrap'}}>
        {painting.figures.map((fig,fi)=>{
          const v = getVal(fig.id);
          const color = FIG_COLORS[fi % FIG_COLORS.length];
          return (
            <div key={fig.id} style={{fontSize:12,color:C.dim}}>
              <span style={{color,marginRight:4}}>■</span>
              {fig.name} ({fig.id}) — x:{v.x.toFixed(3)} y:{v.y.toFixed(3)} w:{v.w.toFixed(3)} h:{v.h.toFixed(3)}
            </div>
          );
        })}
      </div>

      {/* Output */}
      <div style={{marginTop:16,display:'flex',gap:8,alignItems:'center'}}>
        <button onClick={async () => {
          // Build full regions object from current vals
          const regions = {};
          for (const p of PAINTINGS) {
            regions[p.id] = {};
            for (const f of p.figures) {
              const key = `${p.id}_${f.id}`;
              const v = vals[key];
              if (v) regions[p.id][f.id] = { x:v.x, y:v.y, w:v.w, h:v.h, angle:v.angle??0 };
            }
          }
          const res = await fetch('/api/save-face-regions', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ regions }),
          });
          if (res.ok) alert('✅ Saved to lib/faceRegions.js — restart dev server to reload');
          else alert('❌ Save failed');
        }} style={{padding:'6px 18px',background:'rgba(201,168,76,0.15)',
                   border:`1px solid ${C.gold}`,color:C.gold,cursor:'pointer',fontSize:13}}>
          💾 Save to lib/faceRegions.js
        </button>
        <span style={{fontSize:11,color:C.dim}}>
          Saves directly to source — no copy/paste needed
        </span>
      </div>

      {/* Preview output */}
      <div style={{marginTop:12,background:'#18110a',border:`1px solid rgba(201,168,76,0.2)`,
                   padding:10,fontSize:11,fontFamily:'monospace',
                   color:'rgba(242,226,192,0.8)',whiteSpace:'pre',overflowX:'auto',
                   lineHeight:1.8,maxHeight:300,overflowY:'auto'}}>
        {allOutput}
      </div>

      <div style={{marginTop:8,fontSize:11,color:C.dim}}>
        After saving, remember to manually add correct <code>angle</code> values in <code>lib/faceRegions.js</code>
      </div>
    </div>
  );
}
