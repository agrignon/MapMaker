import { useMapStore } from '../../store/mapStore';

export function DrawButton() {
  const drawMode = useMapStore((s) => s.drawMode);
  const setDrawMode = useMapStore((s) => s.setDrawMode);

  return (
    <button
      onClick={() => setDrawMode(!drawMode)}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        backgroundColor: drawMode ? 'rgba(59, 130, 246, 0.9)' : 'rgba(17, 24, 39, 0.75)',
        backdropFilter: 'blur(12px)',
        color: 'rgba(255, 255, 255, 0.9)',
        border: drawMode ? '2px solid rgba(59, 130, 246, 1)' : '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        transition: 'background-color 0.15s, border-color 0.15s',
        touchAction: 'manipulation',
      }}
      title={drawMode ? 'Cancel drawing' : 'Draw selection rectangle'}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="12" height="12" rx="1" strokeDasharray={drawMode ? 'none' : '3 2'} />
        {!drawMode && (
          <>
            <line x1="2" y1="2" x2="5" y2="2" strokeDasharray="none" />
            <line x1="2" y1="2" x2="2" y2="5" strokeDasharray="none" />
            <line x1="14" y1="2" x2="11" y2="2" strokeDasharray="none" />
            <line x1="14" y1="2" x2="14" y2="5" strokeDasharray="none" />
            <line x1="2" y1="14" x2="5" y2="14" strokeDasharray="none" />
            <line x1="2" y1="14" x2="2" y2="11" strokeDasharray="none" />
            <line x1="14" y1="14" x2="11" y2="14" strokeDasharray="none" />
            <line x1="14" y1="14" x2="14" y2="11" strokeDasharray="none" />
          </>
        )}
      </svg>
      {drawMode ? 'Drawing...' : 'Draw Area'}
    </button>
  );
}
