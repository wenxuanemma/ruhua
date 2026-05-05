// pages/calibrate-crops.jsx
// Visit http://localhost:3000/calibrate-crops
//
// Shows each painting from filtered-metadata.json with DINO-detected face boxes.
// Click boxes to select/delete, drag to move, drag corners to resize.
// Add new boxes by clicking on the image.
// Save corrections to public/face-corrections.json via API.

import { useState, useEffect, useRef, useCallback } from 'react';

const C = {
  bg: '#0c0904',
  gold: '#c9a84c',
  red: '#e24b4a',
  text: '#f2e2c0',
  dim: 'rgba(242,226,192,0.45)',
  boxDino: 'rgba(64,160,255,0.7)',    // DINO detected — blue
  boxKept: 'rgba(64,200,100,0.85)',   // kept/edited — green
  boxNew:  'rgba(255,180,0,0.85)',    // manually added — yellow
};

export default function CalibrateCrops() {
  const [paintings, setPaintings]   = useState([]);
  const [idx, setIdx]               = useState(0);
  const [boxes, setBoxes]           = useState([]);   // {x,y,w,h, state:'dino'|'kept'|'new'|'deleted'}
  const [selected, setSelected]     = useState(null);
  const [imgSize, setImgSize]       = useState({w:1,h:1});
  const [corrections, setCorrections] = useState({});
  const [saved, setSaved]           = useState(false);
  const [dragging, setDragging]     = useState(null);
  const draggingRef  = useRef(null);
  const boxesRef     = useRef([]);
  const addModeRef   = useRef(false);
  const [addMode, setAddMode]       = useState(false);
  const [newBoxStart, setNewBoxStart] = useState(null);
  const newBoxStartRef = useRef(null);
  const [imgError, setImgError] = useState(false);
  const [jumpVal, setJumpVal]   = useState('');
  const imgRef  = useRef(null);
  const wrapRef = useRef(null);

  // Load filtered-metadata.json
  useEffect(() => {
    fetch('/api/training-data')
      .then(r => r.json())
      .then(data => {
        setPaintings(data.paintings || []);
      })
      .catch(() => {
        // fallback: load from window if API not available
        console.warn('API not available');
      });
    // Load existing corrections from museum-paintings/face-corrections.json via API
    fetch('/api/load-corrections')
      .then(r => r.json())
      .then(data => setCorrections(data))
      .catch(() => setCorrections({}));
  }, []);

  const painting = paintings[idx];

  // When painting changes, load its boxes
  useEffect(() => {
    if (!painting) return;
    setSaved(false);
    setSelected(null);
    setImgError(false); // let onError handler set this if ID-based lookup also fails

    const dinoFaces = (painting.faces || []).map(f => ({ ...f, state: 'dino' }));
    const title = painting.title || '';

    // If corrections exist for this painting, use them (even if empty — means all deleted)
    if (title in corrections) {
      const corrFaces = (corrections[title].faces || []).map(f => ({ ...f, state: 'kept' }));
      setBoxes(corrFaces);
    } else {
      setBoxes(dinoFaces);
    }
  }, [idx, painting?.title, corrections]);

  const onImgLoad = () => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
    }
  };

  // Convert normalized coords to px
  const toP  = (v, dim) => v * dim;
  // Convert px to normalized
  const toN  = (v, dim) => v / dim;

  const getMousePos = (e) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return {x:0,y:0};
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    };
  };

  const onImgMouseDown = useCallback((e) => {
    if (!imgRef.current) return;
    e.preventDefault();
    const pos = getMousePos(e);

    if (addModeRef.current) {
      newBoxStartRef.current = pos;
      setNewBoxStart(pos);
      return;
    }

    const currentBoxes = boxesRef.current;
    const CORNER_HIT = 0.025;
    for (let i = currentBoxes.length - 1; i >= 0; i--) {
      const b = currentBoxes[i];
      if (b.state === 'deleted') continue;
      const corners = [
        { name: 'tl', x: b.x,       y: b.y },
        { name: 'tr', x: b.x+b.w,   y: b.y },
        { name: 'bl', x: b.x,       y: b.y+b.h },
        { name: 'br', x: b.x+b.w,   y: b.y+b.h },
      ];
      for (const c of corners) {
        if (Math.abs(pos.x - c.x) < CORNER_HIT && Math.abs(pos.y - c.y) < CORNER_HIT) {
          setSelected(i);
          const d = { type:'resize', boxIdx:i, corner:c.name, startX:pos.x, startY:pos.y };
          draggingRef.current = d;
          setDragging(d);
          return;
        }
      }
      if (pos.x >= b.x && pos.x <= b.x+b.w && pos.y >= b.y && pos.y <= b.y+b.h) {
        setSelected(i);
        const d = { type:'move', boxIdx:i, startX:pos.x, startY:pos.y };
        draggingRef.current = d;
        setDragging(d);
        return;
      }
    }
    setSelected(null);
  }, []); // no deps — reads everything from refs

  // Keep refs in sync with state
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { newBoxStartRef.current = newBoxStart; }, [newBoxStart]);
  useEffect(() => { boxesRef.current = boxes; }, [boxes]);
  useEffect(() => { addModeRef.current = addMode; }, [addMode]);

  // Attach drag handlers to window — use refs to avoid stale closures
  useEffect(() => {
    const onMove = (e) => {
      const drag = draggingRef.current;
      if (!drag || !imgRef.current) return;
      e.preventDefault();
      const pos = getMousePos(e);
      // Incremental delta from last position — no origBox needed
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      // Update ref immediately so next event uses latest position
      draggingRef.current = { ...drag, startX: pos.x, startY: pos.y };

      setBoxes(prev => {
        const next = [...prev];
        const b = { ...next[drag.boxIdx] };
        if (drag.type === 'move') {
          b.x = Math.max(0, Math.min(1 - b.w, b.x + dx));
          b.y = Math.max(0, Math.min(1 - b.h, b.y + dy));
        } else {
          const { corner } = drag;
          if (corner === 'br') { b.w = Math.max(0.01, b.w + dx); b.h = Math.max(0.01, b.h + dy); }
          if (corner === 'bl') { b.x += dx; b.w = Math.max(0.01, b.w - dx); b.h = Math.max(0.01, b.h + dy); }
          if (corner === 'tr') { b.y += dy; b.w = Math.max(0.01, b.w + dx); b.h = Math.max(0.01, b.h - dy); }
          if (corner === 'tl') { b.x += dx; b.y += dy; b.w = Math.max(0.01, b.w - dx); b.h = Math.max(0.01, b.h - dy); }
          b.x = Math.max(0, b.x); b.y = Math.max(0, b.y);
          b.w = Math.min(1 - b.x, b.w); b.h = Math.min(1 - b.y, b.h);
        }
        b.state = b.state === 'dino' ? 'kept' : b.state;
        next[drag.boxIdx] = b;
        return next;
      });
    };
    const onUp = (e) => {
      const nbs = newBoxStartRef.current;
      if (nbs) {
        const pos = getMousePos(e);
        const x = Math.min(nbs.x, pos.x);
        const y = Math.min(nbs.y, pos.y);
        const w = Math.abs(pos.x - nbs.x);
        const h = Math.abs(pos.y - nbs.y);
        if (w > 0.01 && h > 0.01) {
          setBoxes(prev => [...prev, {x,y,w,h,state:'new'}]);
        }
        setNewBoxStart(null);
        newBoxStartRef.current = null;
        return;
      }
      setDragging(null);
      draggingRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []); // empty deps — uses refs, never goes stale

  const deleteSelected = () => {
    if (selected === null) return;
    setBoxes(prev => {
      const next = [...prev];
      next[selected] = { ...next[selected], state: 'deleted' };
      return next;
    });
    setSelected(null);
  };

  const saveCorrections = async () => {
    if (!painting) return;
    const title = painting.title;
    const kept = boxes.filter(b => b.state !== 'deleted' && b.state !== 'dino')
      .map(({x,y,w,h}) => ({x:+x.toFixed(4),y:+y.toFixed(4),w:+w.toFixed(4),h:+h.toFixed(4)}));
    // Also keep dino boxes that weren't modified/deleted
    const dinoKept = boxes.filter(b => b.state === 'dino')
      .map(({x,y,w,h}) => ({x:+x.toFixed(4),y:+y.toFixed(4),w:+w.toFixed(4),h:+h.toFixed(4)}));
    const allKept = [...dinoKept, ...kept];

    const newCorrections = {
      ...corrections,
      [title]: { mode: 'replace', faces: allKept },
    };
    // Remove _readme if present
    delete newCorrections['_readme'];

    setCorrections(newCorrections);

    // Save via API
    try {
      const res = await fetch('/api/save-corrections', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(newCorrections),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        // Reload from file to stay in sync
        fetch('/api/load-corrections').then(r=>r.json()).then(setCorrections).catch(()=>{});
      }
    } catch (e) {
      // Fallback: copy to clipboard
      navigator.clipboard?.writeText(JSON.stringify(newCorrections, null, 2));
      alert('API not available — corrections copied to clipboard. Paste into museum-paintings/face-corrections.json');
    }
  };

  const activeFaces = boxes.filter(b => b.state !== 'deleted');
  const hasPainting = !!painting;

  const boxColor = (b) => {
    if (b.state === 'new')  return C.boxNew;
    if (b.state === 'kept') return C.boxKept;
    return C.boxDino;
  };

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'sans-serif',padding:16}}>

      <div style={{fontSize:20,color:C.gold,marginBottom:8}}>
        入画 · Face Box Editor for Training Data
      </div>
      <div style={{fontSize:11,color:C.dim,marginBottom:12}}>
        <span style={{color:C.boxDino}}>■</span> DINO detected &nbsp;
        <span style={{color:C.boxKept}}>■</span> kept/edited &nbsp;
        <span style={{color:C.boxNew}}>■</span> manually added &nbsp;
        | Drag to move · Drag corners to resize · Delete key or button to remove
      </div>

      {/* Painting navigation */}
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
        <button onClick={() => setIdx(i => Math.max(0,i-1))}
          style={{padding:'4px 12px',background:'rgba(201,168,76,0.15)',border:`1px solid ${C.gold}`,color:C.gold,cursor:'pointer'}}>
          ← Prev
        </button>
        {/* Prominent index display */}
        <span style={{
          fontSize:16,fontWeight:'bold',color:C.gold,
          background:'rgba(201,168,76,0.1)',padding:'2px 10px',
          border:`1px solid rgba(201,168,76,0.3)`,borderRadius:4,
          minWidth:60,textAlign:'center',
        }}>
          #{idx+1}
        </span>
        <span style={{fontSize:12,color:C.dim}}>of {paintings.length}</span>
        <button onClick={() => setIdx(i => Math.min(paintings.length-1,i+1))}
          style={{padding:'4px 12px',background:'rgba(201,168,76,0.15)',border:`1px solid ${C.gold}`,color:C.gold,cursor:'pointer'}}>
          Next →
        </button>
        {/* Jump to index */}
        <input
          type="number" placeholder="Go to #"
          value={jumpVal}
          onChange={e => setJumpVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const n = parseInt(jumpVal) - 1;
              if (!isNaN(n) && n >= 0 && n < paintings.length) setIdx(n);
              setJumpVal('');
            }
          }}
          style={{width:70,padding:'3px 6px',background:'#18110a',border:`1px solid rgba(201,168,76,0.3)`,
                  color:C.text,fontSize:12}}
        />
        <span style={{fontSize:14,color:C.text,marginLeft:4}}>
          {painting?.title?.slice(0,55)}
        </span>
        {corrections[painting?.title] &&
          <span style={{fontSize:11,color:C.boxKept,marginLeft:4}}>✓ corrected</span>}
        {imgError &&
          <span style={{fontSize:11,color:C.red,marginLeft:4}}>⚠️ image missing</span>}
      </div>

      {/* Jump to painting with 0 crops */}
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <button onClick={()=>{
          for(let i=idx+1;i<paintings.length;i++){
            if(!corrections[paintings[i]?.title] && (paintings[i]?.faces||[]).length>0){setIdx(i);return;}
          }
        }} style={{padding:'3px 10px',background:'rgba(226,75,74,0.15)',border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',fontSize:12}}>
          Next uncorrected →
        </button>
        <button onClick={() => setAddMode(m => !m)}
          style={{padding:'3px 10px',border:`1px solid ${addMode?C.boxNew:C.dim}`,
                  background:addMode?'rgba(255,180,0,0.15)':'transparent',
                  color:addMode?C.boxNew:C.dim,cursor:'pointer',fontSize:12}}>
          {addMode ? '✚ Draw mode ON (click+drag)' : '✚ Add box'}
        </button>
        {selected !== null && boxes[selected]?.state !== 'deleted' && (
          <button onClick={deleteSelected}
            style={{padding:'3px 10px',background:'rgba(226,75,74,0.15)',border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',fontSize:12}}>
            🗑 Delete selected
          </button>
        )}
        <button onClick={saveCorrections}
          style={{padding:'3px 12px',background:saved?'rgba(64,200,100,0.2)':'rgba(201,168,76,0.15)',
                  border:`1px solid ${saved?C.boxKept:C.gold}`,color:saved?C.boxKept:C.gold,cursor:'pointer',fontSize:12}}>
          {saved ? '✓ Saved!' : '💾 Save corrections'}
        </button>
      </div>

      {/* Image + boxes */}
      {hasPainting && (
        <div style={{position:'relative',display:'inline-block',cursor:addMode?'crosshair':'default'}}
             ref={wrapRef}
             onMouseDown={imgError ? undefined : onImgMouseDown}>
          {imgError ? (
            <div style={{
              width:600,background:'#18110a',
              border:`1px solid ${C.red}`,padding:16,
              fontFamily:'monospace',fontSize:12,
            }}>
              <div style={{color:C.red,fontSize:14,marginBottom:8}}>⚠️ Image file not found</div>
              <table style={{borderCollapse:'collapse',width:'100%',color:C.dim}}>
                <tbody>
                  <tr><td style={{color:C.gold,paddingRight:12,paddingBottom:4}}>Index:</td>
                      <td style={{color:C.text}}>#{idx+1}</td></tr>
                  <tr><td style={{color:C.gold,paddingRight:12,paddingBottom:4}}>ID:</td>
                      <td style={{color:C.text}}>{painting.id}</td></tr>
                  <tr><td style={{color:C.gold,paddingRight:12,paddingBottom:4}}>Title:</td>
                      <td style={{color:C.text,wordBreak:'break-all'}}>{painting.title}</td></tr>
                  <tr><td style={{color:C.gold,paddingRight:12,paddingBottom:4}}>Source:</td>
                      <td style={{color:C.text}}>{painting.source}</td></tr>
                  <tr><td style={{color:C.gold,paddingRight:12,paddingBottom:4}}>localFile:</td>
                      <td style={{color:'rgba(242,226,192,0.4)',wordBreak:'break-all'}}>{painting.localFile || '(none)'}</td></tr>
                  <tr><td style={{color:C.gold,paddingRight:12,paddingBottom:4}}>Search for:</td>
                      <td style={{color:C.boxNew}}>{String(painting.id)}_*</td></tr>
                </tbody>
              </table>
              <div style={{marginTop:8,color:'rgba(242,226,192,0.3)',fontSize:11}}>
                Run in terminal: <span style={{color:C.boxNew}}>
                  ls wikimedia-paintings/images/ | grep "^{String(painting.id)}_"
                </span>
              </div>
              <button onClick={() => setIdx(i => Math.min(paintings.length-1, i+1))}
                style={{marginTop:12,padding:'4px 16px',background:'rgba(226,75,74,0.15)',
                        border:`1px solid ${C.red}`,color:C.red,cursor:'pointer',fontSize:12}}>
                Skip →
              </button>
            </div>
          ) : (
            <img ref={imgRef}
                 src={`/api/painting-image?id=${encodeURIComponent(painting.id)}&path=${encodeURIComponent(painting.localFile||'')}`}
                 alt={painting.title}
                 style={{display:'block',maxWidth:'min(90vw,900px)',maxHeight:'70vh',
                         border:`1px solid rgba(201,168,76,0.2)`,userSelect:'none'}}
                 onLoad={onImgLoad}
                 onError={() => setImgError(true)}
                 draggable={false}
            />
          )}

          {/* Render boxes — only when image loaded successfully */}
          {!imgError && boxes.map((b, i) => {
            if (b.state === 'deleted') return null;
            const isSelected = selected === i;
            const color = boxColor(b);
            const px = toP(b.x, imgSize.w);
            const py = toP(b.y, imgSize.h);
            const pw = toP(b.w, imgSize.w);
            const ph = toP(b.h, imgSize.h);
            return (
              <div key={i} style={{
                position:'absolute', left:px, top:py, width:pw, height:ph,
                border:`2px solid ${color}`,
                background: isSelected ? `${color.replace('0.7','0.15').replace('0.85','0.15')}` : 'transparent',
                boxSizing:'border-box', cursor:'move',
                boxShadow: isSelected ? `0 0 0 1px #fff` : 'none',
              }}>
                {/* Corner handles */}
                {isSelected && [['tl',0,0],['tr',pw-12,0],['bl',0,ph-12],['br',pw-12,ph-12]].map(([c,cx,cy]) => (
                  <div key={c} style={{
                    position:'absolute',left:cx,top:cy,width:12,height:12,
                    background:color,cursor:'nwse-resize',zIndex:10,
                  }}/>
                ))}
                <div style={{
                  position:'absolute',top:-14,left:0,
                  background:color.replace('0.7','0.9').replace('0.85','0.9'),
                  color:'#000',fontSize:8,padding:'0px 3px',whiteSpace:'nowrap',
                  display: isSelected ? 'block' : 'none',
                }}>
                  {i} {(b.w*100).toFixed(0)}×{(b.h*100).toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Box list */}
      <div style={{marginTop:12,fontSize:11,color:C.dim}}>
        <strong style={{color:C.text}}>Active boxes ({activeFaces.length}):</strong>
        {activeFaces.map((b,i) => (
          <span key={i} style={{
            marginLeft:8,padding:'2px 6px',border:`1px solid ${boxColor(b)}`,
            color:boxColor(b),cursor:'pointer',display:'inline-block',marginTop:4,
          }} onClick={() => setSelected(boxes.indexOf(b))}>
            [{i}] {(b.x).toFixed(2)},{(b.y).toFixed(2)} {(b.w*100).toFixed(0)}×{(b.h*100).toFixed(0)}%
          </span>
        ))}
      </div>

      {/* Output preview */}
      <div style={{
        marginTop:12,background:'#18110a',border:`1px solid rgba(201,168,76,0.2)`,
        padding:10,fontSize:11,fontFamily:'monospace',color:C.dim,
        maxWidth:700,wordBreak:'break-all',
      }}>
        <strong style={{color:C.text}}>face-corrections.json entry:</strong><br/>
        {hasPainting && JSON.stringify({
          [painting.title]: {
            mode: 'replace',
            faces: activeFaces.map(({x,y,w,h}) => ({
              x:+x.toFixed(4),y:+y.toFixed(4),
              w:+w.toFixed(4),h:+h.toFixed(4),
            })),
          }
        }, null, 2)}
      </div>
    </div>
  );
}
