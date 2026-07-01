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
  { id:'hanxizai', title:'韩熙载夜宴图', wikiTitle:'The_Night_Revels_of_Han_Xizai',
    figures:[
      {id:'guest',  name:'宾客'},
      {id:'host',   name:'韩熙载'},
      {id:'dancer', name:'乐伎'},
    ]},
  { id:'gongle', title:'宫乐图', directImageUrl:'/paintings/gongle.jpg',
    figures:[
      {id:'pipa',     name:'琵琶仕女'},
      {id:'guzheng',  name:'古筝仕女'},
      {id:'clapper',  name:'执拍侍女'},
      {id:'listener', name:'听乐仕女'},
    ]},
  { id:'daolian', title:'捣练图', directImageUrl:'/paintings/daolian.jpg',
    figures:[
      {id:'girl',     name:'粉衣小童'},
      {id:'threader', name:'穿针仕女'},
    ]},
  { id:'yinger', title:'戏婴图', directImageUrl:'/paintings/yinger.jpg',
    figures:[
      {id:'topleft',    name:'左上仕女'},
      {id:'bottomleft', name:'左下仕女'},
      {id:'topcenter',  name:'中上仕女'},
      {id:'right',      name:'右侧仕女'},
    ]},
  { id:'tiaoqin', title:'调琴啜茗图', directImageUrl:'/paintings/tiaoqin.jpg',
    figures:[
      {id:'lady',   name:'调琴仕女'},
      {id:'seated', name:'静坐仕女'},
    ]},
  { id:'huishan', title:'挥扇仕女图', directImageUrl:'/paintings/huishan.jpg',
    figures:[
      {id:'center', name:'执瓶仕女'},
      {id:'seated', name:'倚坐仕女'},
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
            if (v.x !== undefined) { // skip nested objects like visitor
              loaded[`${paintingId}_${figId}`] = { ...v, _original: v };
            }
          }
        }
        setVals(loaded);
      })
      .catch(() => {}); // silently fall back to hardcoded defaults
  }, []);

  // Fetch painting image when painting changes
  useEffect(() => {
    setImgUrl('');
    if (painting.directImageUrl) {
      setImgUrl(painting.directImageUrl);
    } else if (painting.commonsTitle) {
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

  // Auto-detect faceSize by running MediaPipe on the painting figure crop.
  // Image is fetched server-side to avoid canvas CORS tainted error.
  const autoDetectFaceSize = async (figId) => {
    if (!imgUrl) return;
    const key = `${painting.id}_${figId}`;
    const v = getVal(figId);
    if (!v.x) return;

    try {
      // Send painting URL + crop region to server — server fetches + crops + detects
      const res = await fetch(`/api/detect-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          painting_url: imgUrl,
          crop: { x: v.x, y: v.y, w: v.w, h: v.h },
        }),
      });
      if (!res.ok) throw new Error('detect failed');
      const { box, faceSize, faceCenter, error } = await res.json();
      if (error) throw new Error(error);
      if (!box) throw new Error('no face detected');
      const updates = {};
      if (faceSize != null) updates.faceSize = faceSize;
      if (faceCenter != null) updates.faceCenter = faceCenter;
      setVals(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));
      alert(`Auto detect for ${figId}: faceSize=${faceSize} faceCenter=(${faceCenter?.cx},${faceCenter?.cy})`);
    } catch(e) {
      alert(`Auto detect failed: ${e.message}`);
    }
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
        if (drag.type === 'skinSample') {
          return { ...prev, [key]: { ...ob,
            skinSample: { cx: Math.max(0,Math.min(1,ob.skinSample.cx+dx)), cy: Math.max(0,Math.min(1,ob.skinSample.cy+dy)), r: ob.skinSample.r||0.008 }
          }};
        }
        const b = drag.type === 'move' ? {
          x: Math.max(0, Math.min(1-ob.w, ob.x+dx)),
          y: Math.max(0, Math.min(1-ob.h, ob.y+dy)),
          w: ob.w, h: ob.h, angle: ob.angle||0,
        } : (() => {
          let {x,y,w,h} = ob;
          const c = drag.corner;
          if (c==='br') { w=Math.max(0.01,ob.w+dx); h=Math.max(0.01,ob.h+dy); }
          if (c==='bl') { x=ob.x+dx; w=Math.max(0.01,ob.w-dx); h=Math.max(0.01,ob.h+dy); }
          if (c==='tr') { y=ob.y+dy; w=Math.max(0.01,ob.w+dx); h=Math.max(0.01,ob.h-dy); }
          if (c==='tl') { x=ob.x+dx; y=ob.y+dy; w=Math.max(0.01,ob.w-dx); h=Math.max(0.01,ob.h-dy); }
          return { x:Math.max(0,x), y:Math.max(0,y), w:Math.min(1,w), h:Math.min(1,h), angle:ob.angle||0 };
        })();
        return { ...prev, [key]: { ...prev[key], ...b } };
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
    const DOT_HIT = 0.018;

    // Check skinSample dot drag first
    for (let fi = 0; fi < painting.figures.length; fi++) {
      const fig = painting.figures[fi];
      const v = getVal(fig.id);
      if (v.skinSample) {
        const { cx, cy } = v.skinSample;
        if (Math.abs(pos.x - cx) < DOT_HIT && Math.abs(pos.y - cy) < DOT_HIT) {
          const d = { type:'skinSample', paintingId:painting.id, figId:fig.id,
                      startX:pos.x, startY:pos.y, origBox:{...v} };
          draggingRef.current = d; setDragging(d); return;
        }
      }
    }

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
      return `    ${f.id.padEnd(12)}: { x:${v.x.toFixed(4)}, y:${v.y.toFixed(4)}, w:${v.w.toFixed(4)}, h:${v.h.toFixed(4)}, angle:${v.angle??0} },`;
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

        {/* Figure ovals */}
        {painting.figures.map((fig, fi) => {
          const v = getVal(fig.id);
          const color = FIG_COLORS[fi % FIG_COLORS.length];
          const isDragging = dragging?.figId === fig.id;
          const px = v.x * imgSize.w, py = v.y * imgSize.h;
          const pw = v.w * imgSize.w, ph = v.h * imgSize.h;
          const hw = 10;
          return (
            <div key={fig.id} style={{
              position:'absolute', left:px, top:py, width:pw, height:ph,
              boxSizing:'border-box', cursor:'move',
              transform:`rotate(${v.angle||0}deg)`,
              transformOrigin:'center center',
            }}>
              <div style={{
                position:'absolute', left:0, top:0, width:'100%', height:'100%',
                borderRadius:'50%',
                border:`1px solid ${color}88`,
                background: isDragging ? `${color}22` : `${color}11`,
                pointerEvents:'none',
              }}/>
              {[
                [0,     0,     'tl', '\u2196'],
                [pw-hw, 0,     'tr', '\u2197'],
                [0,     ph-hw, 'bl', '\u2199'],
                [pw-hw, ph-hw, 'br', '\u2198'],
              ].map(([cx,cy,corner,arrow])=>(
                <div key={corner} style={{
                  position:'absolute', left:cx, top:cy,
                  width:hw, height:hw,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9, color:color, cursor:'nwse-resize', zIndex:10,
                  textShadow:'0 0 2px #000',
                }}>{arrow}</div>
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
        {/* skinSample dots */}
        {painting.figures.map((fig, fi) => {
          const v = getVal(fig.id);
          const color = FIG_COLORS[fi % FIG_COLORS.length];
          if (!v.skinSample) return null;
          const { cx, cy } = v.skinSample;
          const dotX = cx * imgSize.w;
          const dotY = cy * imgSize.h;
          const dotR = Math.max(4, (v.skinSample.r || v.w * 0.15) * imgSize.w);
          return (
            <div key={`skin_${fig.id}`} style={{
              position:'absolute',
              left: dotX - dotR, top: dotY - dotR,
              width: dotR*2, height: dotR*2,
              borderRadius:'50%',
              border: `1px solid ${color}88`,
              background: `${color}55`,
              cursor:'move',
              boxSizing:'border-box',
              pointerEvents:'all',
              zIndex:20,
            }}>
              {/* crosshair */}
              <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:color,transform:'translateX(-50%)'}}/>
              <div style={{position:'absolute',top:'50%',left:0,right:0,height:1,background:color,transform:'translateY(-50%)'}}/>
            </div>
          );
        })}
      </div>

      {/* Legend + Angle sliders */}
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        {painting.figures.map((fig,fi)=>{
          const v = getVal(fig.id);
          const color = FIG_COLORS[fi % FIG_COLORS.length];
          return (
            <div key={fig.id} style={{fontSize:12,color:C.dim,
              background:'rgba(0,0,0,0.3)',padding:'6px 10px',borderRadius:4,
              border:`1px solid ${color}33`}}>
              <div style={{marginBottom:4}}>
                <span style={{color,marginRight:4}}>■</span>
                <span style={{color:C.text}}>{fig.name}</span>
                <span style={{marginLeft:8,color:C.dim,fontSize:10}}>
                  x:{v.x?.toFixed(3)} y:{v.y?.toFixed(3)} w:{v.w?.toFixed(3)} h:{v.h?.toFixed(3)}
                </span>
                {v.skinSample
                  ? <span style={{marginLeft:8,color:'#00ff88',fontSize:10}}>
                      🎨 skin:({v.skinSample.cx.toFixed(3)},{v.skinSample.cy.toFixed(3)})
                    </span>
                  : <button onClick={() => {
                      const key = `${painting.id}_${fig.id}`;
                      // Place dot at center of face region as starting point
                      setVals(prev => ({...prev, [key]: {...prev[key],
                        skinSample: { cx: v.x+v.w*0.5, cy: v.y+v.h*0.65, r: v.w * 0.15 }
                      }}));
                    }} style={{marginLeft:8,fontSize:9,padding:'1px 5px',cursor:'pointer',
                      background:'rgba(0,255,136,0.1)',border:'1px solid rgba(0,255,136,0.4)',
                      color:'#00ff88',borderRadius:2}}>
                      + skin sample
                    </button>
                }
                {/* Auto faceSize detection */}
                <span style={{marginLeft:8,color:'rgba(242,226,192,0.5)',fontSize:10}}>
                  faceSize:{(v.faceSize ?? 1.0).toFixed(2)}
                </span>
                <button onClick={() => autoDetectFaceSize(fig.id)}
                  style={{marginLeft:4,fontSize:9,padding:'1px 5px',cursor:'pointer',
                    background:'rgba(255,200,50,0.1)',border:'1px solid rgba(255,200,50,0.4)',
                    color:'#ffc832',borderRadius:2}}>
                  auto faceSize
                </button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,color:C.dim,width:40}}>angle:</span>
                <input type="range" min="-90" max="45" step="1"
                  value={v.angle||0}
                  onChange={e => {
                    const key = `${painting.id}_${fig.id}`;
                    setVals(prev => ({
                      ...prev,
                      [key]: { ...prev[key], angle: parseInt(e.target.value) }
                    }));
                  }}
                  style={{width:100}}
                />
                <span style={{fontSize:11,color:color,width:30}}>
                  {v.angle||0}°
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Output */}
      <div style={{marginTop:16,display:'flex',gap:8,alignItems:'center'}}>
        <button onClick={() => {
          fetch('/api/face-regions')
            .then(r => r.json())
            .then(regions => {
              const loaded = {};
              for (const [paintingId, figures] of Object.entries(regions)) {
                for (const [figId, v] of Object.entries(figures)) {
                  if (v.x !== undefined) {
                    loaded[`${paintingId}_${figId}`] = {
                      x:v.x, y:v.y, w:v.w, h:v.h, angle:v.angle||0,
                      skinSample: v.skinSample || null,
                      faceSize:   v.faceSize   ?? null,
                      faceCenter: v.faceCenter || null,
                      _original:  v,
                    };
                  }
                }
              }
              setVals(loaded);
            });
        }} style={{padding:'6px 18px',background:'rgba(226,75,74,0.10)',
                   border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',fontSize:13}}>
          ↺ Reset
        </button>
        <button onClick={async () => {
          // Build full regions object from current vals
          const regions = {};
          for (const p of PAINTINGS) {
            regions[p.id] = {};
            for (const f of p.figures) {
              const key = `${p.id}_${f.id}`;
              const v = vals[key];
              if (v) {
                const known = new Set(['x','y','w','h','angle','faceAngle','skinSample','faceSize','faceCenter','foreheadClip','saturation','brightness','rMax','bMax','exactSample','disabled','_original']);
                const extra = Object.fromEntries(Object.entries(v._original||{}).filter(([k])=>!known.has(k)));
                const orig = v._original || {};
                regions[p.id][f.id] = {
                  x:v.x, y:v.y, w:v.w, h:v.h, angle:v.angle??0,
                  faceAngle: orig.faceAngle,
                  ...(v.skinSample            ? { skinSample:    v.skinSample            } : {}),
                  ...(v.faceSize    != null   ? { faceSize:      v.faceSize              } : {}),
                  ...(v.faceCenter            ? { faceCenter:    v.faceCenter            } : {}),
                  ...(v.foreheadClip         ? { foreheadClip:  v.foreheadClip           } : {}),
                  ...(orig.saturation != null ? { saturation:    orig.saturation         } : {}),
                  ...(orig.brightness != null ? { brightness:    orig.brightness         } : {}),
                  ...(orig.rMax       != null ? { rMax:          orig.rMax               } : {}),
                  ...(orig.bMax       != null ? { bMax:          orig.bMax               } : {}),
                  ...(orig.exactSample        ? { exactSample:   orig.exactSample        } : {}),
                  ...(orig.disabled           ? { disabled:      orig.disabled           } : {}),
                  ...extra,
                };
              }
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
        Saves directly to source. Angles are preserved from existing file if slider shows 0.
        Use the angle slider to explicitly set a non-zero angle.
      </div>
    </div>
  );
}
