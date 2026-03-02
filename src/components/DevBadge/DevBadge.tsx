import { useMapStore } from '../../store/mapStore';

export function DevBadge() {
  const tier = useMapStore((s) => s.deviceTier);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--safe-bottom) + 4px)',
        right: 'calc(var(--safe-right) + 4px)',
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        color: '#fff',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
        pointerEvents: 'none',
        letterSpacing: '0.05em',
      }}
    >
      {tier.toUpperCase()}
    </div>
  );
}
