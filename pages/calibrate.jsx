// pages/calibrate.jsx
// Visit http://localhost:3000/calibrate to use this tool.
// Not linked from the main app — dev/admin use only.

import { useState, useEffect, useRef } from 'react';

const PAINTINGS = [
  {
    id: 'qingming', title: '清明上河图',
    wikiTitle: 'Along_the_River_During_the_Qingming_Festival',
    figures: [
      { id:'scholar',  name:'行路客',  x:0.53, y:0.35, w:0.04, h:0.30, angle:0   },
      { id:'merchant', name:'市井商人', x:0.62, y:0.32, w:0.04, h:0.30, angle:5   },
      { id:'boatman',  name:'船夫',    x:0.44, y:0.40, w:0.04, h:0.28, angle:-8  },
    ],
  },
  {
    id: 'hanxizai', title: '韩熙载夜宴图',
    wikiTitle: 'The_Night_Revels_of_Han_Xizai',
    figures: [
      { id:'guest',  name:'宾客',   x:0.68, y:0.18, w:0.09, h:0.22, angle:5  },
      { id:'host',   name:'韩熙载', x:0.11, y:0.18, w:0.10, h:0.22, angle:-3 },
      { id:'dancer', name:'舞伎',   x:0.46, y:0.22, w:0.08, h:0.20, angle:-5 },
    ],
  },
  {
    id: 'bunianta', title: '步辇图',
    wikiTitle: 'Emperor_Taizong_Receiving_the_Tibetan_Envoy',
    figures: [
      { id:'official', name:'唐朝官员', x:0.46, y:0.18, w:0.09, h:0.28, angle:3  },
      { id:'envoy',    name:'吐蕃使节', x:0.32, y:0.20, w:0.09, h:0.28, angle:-5 },
    ],
  },
  {
    id: 'qianli', title: '千里江山图',
    wikiTitle: 'A_Thousand_Li_of_Rivers_and_Mountains',
    figures: [
      { id:'hermit',    name:'山中隐士', x:0.28, y:0.58, w:0.03, h:0.08, angle:0   },
      { id:'fisherman', name:'江上渔夫', x:0.65, y:0.62, w:0.03, h:0.07, angle:-10 },
    ],
  },
  {
    id: 'luoshen', title: '洛神赋图',
    wikiTitle: 'Nymph_of_the_Luo_River',
    figures: [
      { id:'attendant', name:'随行侍从', x:0.76, y:0.32, w:0.07, h:0.18, angle:-2 },
      { id:'cao',       name:'曹植',     x:0.86, y:0.34, w:0.08, h:0.20, angle:-5 },
    ],
  },
  {
    id: 'gongle', title: '宫乐图',
    wikiTitle: 'Court_Ladies_Playing_Double_Sixes',
    figures: [
      { id:'listener', name:'听乐仕女', x:0.10, y:0.30, w:0.13, h:0.28, angle:0  },
      { id:'musician', name:'琵琶仕女', x:0.46, y:0.14, w:0.11, h:0.24, angle:-8 },
      { id:'serving',  name:'侍女',     x:0.85, y:0.28, w:0.10, h:0.24, angle:2  },
    ],
  },
];

export default function Calibrate() {
  const [pIdx, setPIdx] = useState(1);
  const [fIdx, setFIdx] = useState(0);
  const [vals, setVals] = useState({});
  const [imgUrl, setImgUrl] = useState('');
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const imgRef = useRef(null);

  const painting = PAINTINGS[pIdx];
  const figure = painting.figures[fIdx];
  const key = `${painting.id}:${figure.id}`;
  const v = vals[key] || { x: figure.x, y: figure.y, w: figure.w, h: figure.h, angle: figure.angle };

  // Fetch Wikipedia image URL
  useEffect(() => {
    setImgUrl('');
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${painting.wikiTitle}`)
      .then(r => r.json())
      .then(d => {
        const url = d.originalimage?.source || d.thumbnail?.source;
        if (url) setImgUrl(url);
      })
      .catch(() => {});
  }, [pIdx]);

  const update = (field, val) => {
    setVals(prev => ({
      ...prev,
      [key]: { ...v, [field]: +val },
    }));
  };

  const onImgLoad = () => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
    }
  };

  // All calibrated values as copyable output
  const allOutput = PAINTINGS.flatMap(p =>
    p.figures.map(f => {
      const k = `${p.id}:${f.id}`;
      const saved = vals[k] || f;
      return `  ${p.id} / ${f.id}: { x:${saved.x.toFixed(2)}, y:${saved.y.toFixed(2)}, w:${saved.w.toFixed(2)}, h:${saved.h.toFixed(2)}, angle:${saved.angle} }`;
    })
  ).join('\n');

  const S = {
    page: { minHeight: '100vh', background: '#0c0904', color: '#f2e2c0', fontFamily: 'sans-serif', padding: 24 },
    h1: { fontSize: 28, marginBottom: 20, color: '#c9a84c' },
    row: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
    btn: (active) => ({
      padding: '5px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 4,
      border: `1px solid ${active ? '#c9a84c' : 'rgba(201,168,76,0.3)'}`,
      background: active ? 'rgba(201,168,76,0.15)' : 'transparent',
      color: active ? '#f2e2c0' : 'rgba(242,226,192,0.55)',
    }),
    imgWrap: { position: 'relative', display: 'inline-block', maxWidth: '100%', marginBottom: 16 },
    img: { display: 'block', maxWidth: '100%', maxHeight: 440, border: '1px solid rgba(201,168,76,0.2)' },
    box: {
      position: 'absolute',
      left: v.x * imgSize.w,
      top: v.y * imgSize.h,
      width: v.w * imgSize.w,
      height: v.h * imgSize.h,
      border: '2px solid #e24b4a',
      background: 'rgba(226,75,74,0.2)',
      transform: `rotate(${v.angle}deg)`,
      pointerEvents: 'none',
      boxSizing: 'border-box',
    },
    lbl: {
      position: 'absolute', top: -22, left: 0,
      background: '#e24b4a', color: '#fff', fontSize: 11, padding: '1px 6px',
      borderRadius: 3, whiteSpace: 'nowrap',
    },
    slider: { width: '100%' },
    sliderRow: { marginBottom: 10 },
    sliderLbl: { fontSize: 13, color: 'rgba(242,226,192,0.65)', display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
    code: {
      marginTop: 20, background: '#18110a', border: '1px solid rgba(201,168,76,0.2)',
      padding: 14, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8,
      color: 'rgba(242,226,192,0.65)', whiteSpace: 'pre', overflowX: 'auto',
    },
    note: { fontSize: 12, color: 'rgba(242,226,192,0.4)', marginTop: 8 },
  };

  return (
    <div style={S.page}>
      <div style={S.h1}>入画 · Face Region Calibration</div>

      {/* Painting selector */}
      <div style={S.row}>
        {PAINTINGS.map((p, i) => (
          <button key={p.id} style={S.btn(i === pIdx)}
            onClick={() => { setPIdx(i); setFIdx(0); }}>
            {p.title}
          </button>
        ))}
      </div>

      {/* Figure selector */}
      <div style={S.row}>
        {painting.figures.map((f, i) => (
          <button key={f.id} style={S.btn(i === fIdx)}
            onClick={() => setFIdx(i)}>
            {f.name}
          </button>
        ))}
      </div>

      {/* Image with overlay */}
      <div style={S.imgWrap}>
        {imgUrl
          ? <img ref={imgRef} src={imgUrl} alt={painting.title} style={S.img} onLoad={onImgLoad} />
          : <div style={{ ...S.img, width: 400, height: 250, background: '#18110a', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(242,226,192,0.3)' }}>
              Loading painting…
            </div>
        }
        <div style={S.box}>
          <div style={S.lbl}>{figure.name}</div>
        </div>
      </div>

      {/* Sliders */}
      <div style={{ maxWidth: 480 }}>
        {[
          { label: 'x (left edge)', field: 'x', min: 0,    max: 0.95, step: 0.01 },
          { label: 'y (top edge)',  field: 'y', min: 0,    max: 0.95, step: 0.01 },
          { label: 'w (width)',     field: 'w', min: 0.01, max: 0.5,  step: 0.01 },
          { label: 'h (height)',    field: 'h', min: 0.01, max: 0.6,  step: 0.01 },
          { label: 'angle °',       field: 'angle', min: -30, max: 30, step: 1   },
        ].map(({ label, field, min, max, step }) => (
          <div key={field} style={S.sliderRow}>
            <div style={S.sliderLbl}>
              <span>{label}</span>
              <span style={{ color: '#c9a84c', fontWeight: 500 }}>
                {field === 'angle' ? v[field] : (+v[field]).toFixed(2)}
              </span>
            </div>
            <input type="range" style={S.slider}
              min={min} max={max} step={step} value={v[field]}
              onChange={e => update(field, e.target.value)} />
          </div>
        ))}
      </div>

      {/* Current figure output */}
      <div style={{ ...S.code, marginTop: 12, fontSize: 13 }}>
        {`{ id:'${figure.id}', faceRegion:{ x:${v.x.toFixed(2)}, y:${v.y.toFixed(2)}, w:${v.w.toFixed(2)}, h:${v.h.toFixed(2)}, angle:${v.angle} } }`}
      </div>
      <div style={S.note}>Copy this into composite.js → FACE_REGIONS['{painting.id}']</div>

      {/* Full output for all calibrated figures */}
      <div style={{ ...S.code, marginTop: 24 }}>{'All calibrated values:\n\n' + allOutput}</div>
      <div style={S.note}>Copy the full block above when done with all figures.</div>
    </div>
  );
}
