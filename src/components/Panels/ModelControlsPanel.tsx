import { useMapStore } from '../../store/mapStore';
import { ModelSizeSection } from '../Preview/ModelSizeSection';
import { TerrainSection } from '../Preview/TerrainSection';
import { BuildingsSection } from '../Preview/BuildingsSection';
import { RoadsSection } from '../Preview/RoadsSection';
import { WaterSection } from '../Preview/WaterSection';
import { VegetationSection } from '../Preview/VegetationSection';
import { ExportPanel } from '../Preview/ExportPanel';

export function ModelControlsPanel() {
  const setShowPreview = useMapStore((s) => s.setShowPreview);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '4px' }}>
        <button
          onClick={() => setShowPreview(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '12px',
            padding: '4px 0',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.color = '#d1d5db';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.color = '#9ca3af';
          }}
        >
          {'\u2190'} Back to Edit
        </button>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '13px' }}>
          Model Controls
        </span>
      </div>

      {/* Model Size section — always visible above layers */}
      <div
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: '12px',
          paddingTop: '8px',
        }}
      >
        <ModelSizeSection />
      </div>

      {/* Layers subheading */}
      <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
        <span
          style={{
            color: '#6b7280',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Layers
        </span>
      </div>

      {/* Layer sections in pipeline order */}
      <TerrainSection />
      <BuildingsSection />
      <RoadsSection />
      <WaterSection />
      <VegetationSection />

      {/* Divider before export */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px' }} />

      {/* Export panel at bottom */}
      <ExportPanel />
    </div>
  );
}
