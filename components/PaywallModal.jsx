// components/PaywallModal.jsx
// Credits purchase modal. Visually matches the existing consent modal in
// pages/RuHua.jsx (same color/font constants, duplicated here rather than
// imported since RuHua.jsx doesn't currently export them — small
// duplication, avoids touching an already-large file for this).

import { useState } from 'react';
import { purchaseCredits, restorePurchases } from '../lib/purchases';

const C = {
  bg: '#0c0904',
  card: '#18110a',
  border: 'rgba(201,168,76,0.2)',
  silk: '#f2e2c0',
  silkDim: 'rgba(242,226,192,0.52)',
  silkFaint: 'rgba(242,226,192,0.2)',
  vermillion: '#bf2429',
  gold: '#c9a84c',
  goldFaint: 'rgba(201,168,76,0.1)',
  goldMid: 'rgba(201,168,76,0.22)',
};

const F = {
  brush: "'Ma Shan Zheng', serif",
  serif: "'Noto Serif SC', 'Noto Serif', serif",
};

// products: array from getCreditProducts() — [{ id, credits, priceString?, title? }]
// balance: current credits balance (number)
// onClose: () => void
// onPurchaseComplete: () => void — called after a successful purchase so
//   the parent can refresh balance and retry whatever was gated on it
export default function PaywallModal({ products, balance, onClose, onPurchaseComplete }) {
  const [purchasingId, setPurchasingId] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);

  const handleBuy = async (product) => {
    setError(null);
    setPurchasingId(product.id);
    try {
      await purchaseCredits(product);
      onPurchaseComplete?.();
    } catch (e) {
      // RevenueCat throws a specific error with userCancelled -- don't
      // show an error message for a plain cancel, only real failures.
      if (!e?.userCancelled) {
        console.warn('[PaywallModal] purchase failed:', e);
        setError('购买失败，请重试 · Purchase failed, please try again');
      }
    } finally {
      setPurchasingId(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setRestoring(true);
    try {
      await restorePurchases();
      onPurchaseComplete?.();
    } catch (e) {
      console.warn('[PaywallModal] restore failed:', e);
      setError('恢复失败，请重试 · Restore failed, please try again');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: '#1a1208', border: `1px solid ${C.gold}`,
        borderRadius: 12, padding: '28px 24px', maxWidth: 380, width: '100%',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ fontFamily: F.brush, fontSize: 22, color: C.silk, marginBottom: 6, textAlign: 'center', letterSpacing: '.1em' }}>
          入画点数
        </div>
        <div style={{ fontFamily: F.serif, fontSize: 12, color: C.silkFaint, textAlign: 'center', marginBottom: 18 }}>
          RuHua Credits
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, marginBottom: 20, padding: '10px 0',
          borderTop: `1px solid ${C.goldMid}`, borderBottom: `1px solid ${C.goldMid}`,
        }}>
          <span style={{ fontFamily: F.serif, fontSize: 13, color: C.silkDim }}>当前点数 · Balance</span>
          <span style={{ fontFamily: F.brush, fontSize: 20, color: C.gold }}>{balance}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          {products.map((product) => {
            const isPurchasing = purchasingId === product.id;
            const priceLabel = product.priceString || product.price || '—';
            return (
              <div key={product.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: C.goldFaint, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div>
                  <div style={{ fontFamily: F.serif, fontSize: 15, fontWeight: 600, color: C.silk }}>
                    {product.credits} 点数
                  </div>
                  <div style={{ fontFamily: F.serif, fontSize: 12, color: C.silkFaint }}>
                    {product.credits} Credits
                  </div>
                </div>
                <button
                  onClick={() => handleBuy(product)}
                  disabled={isPurchasing || purchasingId !== null}
                  className="btn"
                  style={{
                    background: C.gold, color: '#1a1208',
                    fontFamily: F.serif, fontSize: 14, fontWeight: 700,
                    padding: '9px 16px', borderRadius: 999,
                    opacity: isPurchasing ? 0.6 : 1,
                    minWidth: 80,
                  }}
                >
                  {isPurchasing ? '···' : priceLabel}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ fontFamily: F.serif, fontSize: 12, color: C.vermillion, textAlign: 'center', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleRestore}
          disabled={restoring}
          className="btn"
          style={{
            background: 'transparent', color: C.silkDim,
            fontFamily: F.serif, fontSize: 12, padding: '8px', width: '100%',
            marginBottom: 6,
          }}
        >
          {restoring ? '恢复中... · Restoring...' : '恢复购买 · Restore Purchases'}
        </button>

        <button
          onClick={onClose}
          className="btn"
          style={{
            background: 'transparent', color: C.silkFaint,
            fontFamily: F.serif, fontSize: 13, padding: '8px', width: '100%',
          }}
        >
          取消 · Cancel
        </button>
      </div>
    </div>
  );
}
