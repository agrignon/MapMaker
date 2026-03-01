import { useEffect, useState, useRef, useCallback } from 'react';
import { useMapStore } from '../../store/mapStore';
import { SelectionInfo } from './SelectionInfo';
import { GenerateButton } from './GenerateButton';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.7;

function MobileSidebar({ hasBbox }: { hasBbox: boolean }) {
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_HEIGHT);

  const maxHeight = typeof window !== 'undefined' ? window.innerHeight * MAX_HEIGHT_RATIO : 500;

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [panelHeight]);

  const onHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = startY.current - e.clientY;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeight.current + delta));
    setPanelHeight(newHeight);
  }, [maxHeight]);

  const onHandlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          backgroundColor: 'rgba(17, 24, 39, 0.9)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '14px 14px 0 0',
          display: 'flex',
          flexDirection: 'column',
          height: panelHeight,
          paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
          touchAction: 'none',
        }}
      >
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 14px 6px',
            cursor: 'ns-resize',
            touchAction: 'none',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.3)',
              marginBottom: 8,
            }}
          />
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              MapMaker
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px', minHeight: 0 }}>
          {hasBbox ? (
            <SelectionInfo />
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              Tap <strong>Draw Area</strong> and drag on the map to select a region.
            </p>
          )}
        </div>

        <div style={{ padding: '8px 14px 4px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <GenerateButton />
        </div>
      </div>
    </div>
  );
}

function DesktopSidebar({ hasBbox }: { hasBbox: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        zIndex: 10,
        width: 260,
        backgroundColor: 'rgba(17, 24, 39, 0.65)',
        backdropFilter: 'blur(12px)',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          MapMaker
        </h1>
      </div>

      <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
        {hasBbox ? (
          <SelectionInfo />
        ) : (
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            Search for a location, then tap <strong>Draw Area</strong> and drag on the map to select a region. On desktop you can also <strong>Shift+drag</strong>.
          </p>
        )}
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <GenerateButton />
      </div>
    </div>
  );
}

export function Sidebar() {
  const hasBbox = useMapStore((s) => s.bbox !== null);
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileSidebar hasBbox={hasBbox} />;
  }

  return <DesktopSidebar hasBbox={hasBbox} />;
}
