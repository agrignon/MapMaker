import { useMapStore } from '../../store/mapStore';
import { CollapsibleSection } from './CollapsibleSection';

export function TerrainSection() {
  const exaggeration = useMapStore((s) => s.exaggeration);
  const basePlateThicknessMM = useMapStore((s) => s.basePlateThicknessMM);
  const smoothingLevel = useMapStore((s) => s.smoothingLevel);
  const setExaggeration = useMapStore((s) => s.setExaggeration);
  const setBasePlateThicknessMM = useMapStore((s) => s.setBasePlateThicknessMM);
  const setSmoothingLevel = useMapStore((s) => s.setSmoothingLevel);

  const summary = `${exaggeration.toFixed(1)}x exag, ${smoothingLevel}% smooth, ${basePlateThicknessMM}mm base`;

  return (
    <CollapsibleSection
      label="Terrain"
      summary={summary}
      defaultOpen={true}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '4px' }}>
        {/* Terrain Exaggeration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <label
              htmlFor="exaggeration-slider"
              style={{ color: '#d1d5db', fontSize: '13px', fontWeight: 500 }}
            >
              Terrain Exaggeration
            </label>
            <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 600 }}>
              {exaggeration.toFixed(1)}x
            </span>
          </div>
          <input
            id="exaggeration-slider"
            type="range"
            min={0.5}
            max={5.0}
            step={0.1}
            value={exaggeration}
            onChange={(e) => setExaggeration(parseFloat(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#3b82f6',
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#6b7280',
              fontSize: '11px',
            }}
          >
            <span>0.5x</span>
            <span>5.0x</span>
          </div>
        </div>

        {/* Terrain Smoothing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <label
              htmlFor="smoothing-slider"
              style={{ color: '#d1d5db', fontSize: '13px', fontWeight: 500 }}
            >
              Smoothing
            </label>
            <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 600 }}>
              {smoothingLevel}%
            </span>
          </div>
          <input
            id="smoothing-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={smoothingLevel}
            onChange={(e) => setSmoothingLevel(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              accentColor: '#3b82f6',
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#6b7280',
              fontSize: '11px',
            }}
          >
            <span>Raw</span>
            <span>Smooth</span>
          </div>
        </div>

        {/* Base Plate Thickness */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            htmlFor="base-plate-input"
            style={{ color: '#d1d5db', fontSize: '13px', fontWeight: 500 }}
          >
            Base Plate
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="base-plate-input"
              type="number"
              min={1}
              max={20}
              step={1}
              value={basePlateThicknessMM}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1) setBasePlateThicknessMM(Math.min(20, v));
              }}
              style={{
                flex: 1,
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                color: '#e5e7eb',
                padding: '6px 10px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <span style={{ color: '#9ca3af', fontSize: '13px' }}>mm</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
