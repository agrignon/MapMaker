import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SidebarContent } from '../Panels/SidebarContent';
import { BottomSheet } from '../BottomSheet/BottomSheet';

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
    return (
      <BottomSheet>
        <SidebarContent />
      </BottomSheet>
    );
  }

  return <DesktopSidebar />;
}
