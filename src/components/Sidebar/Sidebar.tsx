import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SidebarContent } from '../Panels/SidebarContent';

function MobileSidebar() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
        paddingBottom: 'max(8px, var(--safe-bottom))',
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
        maxHeight: '45vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          MapMaker
        </span>
      </div>

      <div style={{ padding: '0 14px 6px', overflowY: 'auto', flexShrink: 1, minHeight: 0 }}>
        <SidebarContent />
      </div>
    </div>
  );
}

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

export function Sidebar() {
  const tier = useBreakpoint();
  const isMobile = tier === 'mobile';

  if (isMobile) {
    return <MobileSidebar />;
  }

  return <DesktopSidebar />;
}
