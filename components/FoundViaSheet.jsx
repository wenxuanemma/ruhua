// components/FoundViaSheet.jsx
// Small bottom card for the one-time "How did you find RuHua?" question
// (see lib/foundVia.js). No backdrop: the result stays visible and usable
// behind it, and one tap on a choice or the × closes it.

import { useState, useRef } from 'react';
import { FOUND_VIA_OPTIONS } from '../lib/foundVia';

// Same palette/fonts as pages/RuHua.jsx (duplicated like PaywallModal does).
const C = {
  silk: '#f2e2c0',
  silkDim: 'rgba(242,226,192,0.52)',
  silkFaint: 'rgba(242,226,192,0.35)',
  gold: '#c9a84c',
  goldFaint: 'rgba(201,168,76,0.08)',
  goldMid: 'rgba(201,168,76,0.28)',
};
const F = {
  brush: "'Ma Shan Zheng', serif",
  serif: "'Noto Serif SC', 'Noto Serif', serif",
};

// onAnswer(source) -- source is an option's value or 'dismissed'.
export default function FoundViaSheet({ onAnswer }) {
  const [thanked, setThanked] = useState(false);
  const done = useRef(false);
  const timer = useRef(null);

  // Exactly one onAnswer call per sheet.
  const finish = (source) => {
    if (done.current) return;
    done.current = true;
    clearTimeout(timer.current);
    onAnswer(source);
  };

  const pick = (source) => {
    if (thanked) return;
    setThanked(true);
    // Brief thank-you, then the parent hides the sheet. Closing during the
    // thank-you still records the choice, not a dismissal.
    timer.current = setTimeout(() => finish(source), 900);
    close.current = () => finish(source);
  };
  const close = useRef(() => finish('dismissed'));

  return (
    <div role="dialog" aria-label="How did you find RuHua?" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      width: 'calc(100% - 24px)', maxWidth: 406, zIndex: 9000,
      background: 'rgba(26,18,8,0.97)', border: `1px solid ${C.goldMid}`,
      borderRadius: 12, padding: '14px 14px 12px',
      boxShadow: '0 -6px 30px rgba(0,0,0,0.55)',
      animation: 'fadeIn .35s ease both',
    }}>
      <button onClick={() => close.current()} aria-label="Close" style={{
        position: 'absolute', top: 6, right: 6, width: 32, height: 32,
        background: 'transparent', border: 'none', color: C.silkDim,
        fontSize: 20, lineHeight: '32px', cursor: 'pointer',
      }}>×</button>

      {thanked ? (
        <div style={{ textAlign: 'center', padding: '18px 0 14px' }}>
          <div style={{ fontFamily: F.brush, fontSize: 20, color: C.silk }}>谢谢</div>
          <div style={{ fontFamily: F.serif, fontSize: 12, color: C.silkDim, marginTop: 2 }}>Thanks!</div>
        </div>
      ) : (
        <>
          <div style={{ paddingRight: 28, marginBottom: 10 }}>
            <div style={{ fontFamily: F.brush, fontSize: 18, color: C.silk, letterSpacing: '.05em' }}>
              你是怎么知道入画的？
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 12, color: C.silkDim, marginTop: 2 }}>
              How did you find RuHua? <span style={{ color: C.silkFaint }}>· 选填 Optional</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {FOUND_VIA_OPTIONS.map(o => (
              <button key={o.source} onClick={() => pick(o.source)} style={{
                minHeight: 44, padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
                background: C.goldFaint, border: `1px solid ${C.goldMid}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontFamily: F.serif, fontSize: 13, color: C.silk, lineHeight: 1.25 }}>{o.zh}</span>
                {o.en !== o.zh && (
                  <span style={{ fontFamily: F.serif, fontSize: 10, color: C.silkDim, lineHeight: 1.25 }}>{o.en}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
