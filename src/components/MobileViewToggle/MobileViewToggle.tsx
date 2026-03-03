import { useBreakpoint } from '../../hooks/useBreakpoint';

interface MobileViewToggleProps {
  activeView: 'map' | 'preview';
  onToggle: () => void;
}

export function MobileViewToggle({ activeView, onToggle }: MobileViewToggleProps) {
  const tier = useBreakpoint();

  if (tier !== 'mobile') return null;

  return (
    <button
      onClick={onToggle}
      aria-label={activeView === 'map' ? 'Show 3D preview' : 'Show map'}
      data-testid="mobile-view-toggle"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        minHeight: 44,
        minWidth: 44,
        padding: '8px 16px',
        backgroundColor: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '8px',
        color: '#e5e7eb',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        touchAction: 'manipulation',
      }}
    >
      {activeView === 'map' ? '3D Preview' : 'Map'}
    </button>
  );
}
