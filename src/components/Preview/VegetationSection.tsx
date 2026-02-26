import { useMapStore } from '../../store/mapStore';
import { CollapsibleSection } from './CollapsibleSection';

export function VegetationSection() {
  const vegetationFeatures = useMapStore((s) => s.vegetationFeatures);
  const vegetationGenerationStatus = useMapStore((s) => s.vegetationGenerationStatus);
  const vegetationVisible = useMapStore((s) => s.layerToggles.vegetation);
  const setLayerToggle = useMapStore((s) => s.setLayerToggle);

  let summary: string;
  if (vegetationGenerationStatus === 'fetching') {
    summary = 'Loading...';
  } else if (vegetationFeatures && vegetationFeatures.length > 0) {
    summary = `${vegetationFeatures.length} vegetation areas`;
  } else if (vegetationGenerationStatus === 'ready') {
    summary = '0 features found';
  } else {
    summary = 'No data';
  }

  return (
    <CollapsibleSection
      label="Vegetation"
      summary={summary}
      toggle={{
        checked: vegetationVisible,
        onChange: (v) => setLayerToggle('vegetation', v),
      }}
      defaultOpen={false}
    >
      {vegetationVisible && (
        <div style={{ paddingTop: '4px' }}>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
            Parks and forests from OpenStreetMap
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
