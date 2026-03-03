import { useCallback, useRef, useState } from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useMapStore } from '../../store/mapStore';
import { SidebarContent } from '../Panels/SidebarContent';

function DesktopSidebar() {
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
        <SidebarContent />
      </div>
    </div>
  );
}

const COLLAPSED_HEIGHT = 48;

function MobileSidebar() {
  const [height, setHeight] = useState(240);
  const setMobilePanelHeight = useMapStore((s) => s.setMobilePanelHeight);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const maxH = window.innerHeight - 40;
    const delta = startY.current - e.clientY;
    const next = Math.max(COLLAPSED_HEIGHT, Math.min(maxH, startH.current + delta));
    setHeight(next);
    setMobilePanelHeight(next);
  }, [setMobilePanelHeight]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const collapsed = height <= COLLAPSED_HEIGHT + 10;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        height,
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
        transition: dragging.current ? 'none' : 'height 0.2s ease-out',
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          flexShrink: 0,
          cursor: 'ns-resize',
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 0 4px',
        }}
      >
        <div style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.35)',
        }} />
      </div>

      <div style={{ padding: '0 14px 2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          MapMaker
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 14px 10px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <SidebarContent />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const tier = useBreakpoint();
  const isMobile = tier === 'mobile';

  if (isMobile) {
    return <MobileSidebar />;
  }

  return <DesktopSidebar />;
}
