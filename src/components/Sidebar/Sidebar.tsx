import { useMapStore } from '../../store/mapStore';
import { SelectionInfo } from './SelectionInfo';
import { GenerateButton } from './GenerateButton';

export function Sidebar() {
  const hasBbox = useMapStore((s) => s.bbox !== null);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        left: 12,
        zIndex: 10,
        width: 'min(260px, calc(100vw - 24px))',
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
