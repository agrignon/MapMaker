import { useMapStore } from '../../store/mapStore';
import { SelectionInfo } from '../Sidebar/SelectionInfo';
import { GenerateButton } from '../Sidebar/GenerateButton';

export function MapControlsPanel() {
  const hasBbox = useMapStore((s) => s.bbox !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {hasBbox ? (
        <SelectionInfo />
      ) : (
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.5)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Search for a location, then tap <strong>Draw Area</strong> and drag on the map to select
          a region. On desktop you can also <strong>Shift+drag</strong>.
        </p>
      )}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
        <GenerateButton />
      </div>
    </div>
  );
}
