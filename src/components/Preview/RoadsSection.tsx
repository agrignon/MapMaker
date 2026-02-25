import { useMapStore } from '../../store/mapStore';
import { CollapsibleSection } from './CollapsibleSection';
import type { RoadStyle } from '../../lib/roads/types';

export function RoadsSection() {
  const roadFeatures = useMapStore((s) => s.roadFeatures);
  const roadGenerationStatus = useMapStore((s) => s.roadGenerationStatus);
  const roadsVisible = useMapStore((s) => s.layerToggles.roads);
  const roadStyle = useMapStore((s) => s.roadStyle);
  const setLayerToggle = useMapStore((s) => s.setLayerToggle);
  const setRoadStyle = useMapStore((s) => s.setRoadStyle);

  // Summary
  let summary: string;
  if (roadGenerationStatus === 'fetching' || roadGenerationStatus === 'building') {
    summary = 'Loading...';
  } else if (roadFeatures && roadFeatures.length > 0) {
    summary = `${roadFeatures.length} roads`;
  } else {
    summary = 'No data';
  }

  return (
    <CollapsibleSection
      label="Roads"
      summary={summary}
      toggle={{
        checked: roadsVisible,
        onChange: (v) => setLayerToggle('roads', v),
      }}
      defaultOpen={false}
    >
      {/* Only show body content when the layer is toggled on (CTRL-04) */}
      {roadsVisible && (
        <div style={{ paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Road style toggle: 3 buttons in a row */}
          <div>
            <span style={{ color: '#9ca3af', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
              Style
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['recessed', 'raised', 'flat'] as RoadStyle[]).map((style) => (
                <button
                  key={style}
                  onClick={() => setRoadStyle(style)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: '11px',
                    fontWeight: roadStyle === style ? 600 : 400,
                    color: roadStyle === style ? '#fff' : '#9ca3af',
                    backgroundColor: roadStyle === style ? '#2563eb' : '#1f2937',
                    border: '1px solid',
                    borderColor: roadStyle === style ? '#3b82f6' : '#374151',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
            Road network from OpenStreetMap
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
