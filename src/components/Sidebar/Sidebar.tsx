import { useState, useEffect } from 'react';
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

function MobileSidebar({ hasBbox }: { hasBbox: boolean }) {
  const [collapsed, setCollapsed] = useState(false);

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
          backgroundColor: 'rgba(17, 24, 39, 0.85)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            MapMaker
          </span>
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>
            {collapsed ? '▲' : '▼'}
          </span>
        </div>

        {!collapsed && (
          <>
            <div style={{ padding: '0 14px 8px', maxHeight: '30vh', overflowY: 'auto' }}>
              {hasBbox ? (
                <SelectionInfo />
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  Tap <strong>Draw Area</strong> and drag on the map to select a region.
                </p>
              )}
            </div>

            <div style={{ padding: '8px 14px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <GenerateButton />
            </div>
          </>
        )}
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
