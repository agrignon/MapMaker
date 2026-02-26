import { useMapStore } from '../../store/mapStore';
import { CollapsibleSection } from './CollapsibleSection';

export function WaterSection() {
  const waterFeatures = useMapStore((s) => s.waterFeatures);
  const waterGenerationStatus = useMapStore((s) => s.waterGenerationStatus);
  const waterVisible = useMapStore((s) => s.layerToggles.water);
  const setLayerToggle = useMapStore((s) => s.setLayerToggle);

  let summary: string;
  if (waterGenerationStatus === 'fetching') {
    summary = 'Loading...';
  } else if (waterFeatures && waterFeatures.length > 0) {
    summary = `${waterFeatures.length} water bodies`;
  } else {
    summary = 'No data';
  }

  return (
    <CollapsibleSection
      label="Water"
      summary={summary}
      toggle={{
        checked: waterVisible,
        onChange: (v) => setLayerToggle('water', v),
      }}
      defaultOpen={false}
    >
      {waterVisible && (
        <div style={{ paddingTop: '4px' }}>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
            Rivers and lakes from OpenStreetMap
          </p>
          <p style={{ color: '#6b7280', fontSize: '11px', margin: '4px 0 0', fontStyle: 'italic' }}>
            Ocean areas are not yet supported
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
