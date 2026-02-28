import { useMapStore } from '../../store/mapStore';
import { CollapsibleSection } from './CollapsibleSection';

export function BuildingsSection() {
  const buildingFeatures = useMapStore((s) => s.buildingFeatures);
  const buildingGenerationStatus = useMapStore((s) => s.buildingGenerationStatus);
  const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);
  const setLayerToggle = useMapStore((s) => s.setLayerToggle);

  let summary: string;
  if (buildingGenerationStatus === 'fetching') {
    summary = 'Loading...';
  } else if (buildingFeatures && buildingFeatures.length > 0) {
    summary = `${buildingFeatures.length} buildings`;
  } else {
    summary = 'No data';
  }

  return (
    <CollapsibleSection
      label="Buildings"
      summary={summary}
      toggle={{
        checked: buildingsVisible,
        onChange: (v) => setLayerToggle('buildings', v),
      }}
      defaultOpen={false}
    >
      {/* Only show body content when the layer is toggled on */}
      {buildingsVisible && (
        <div style={{ paddingTop: '4px' }}>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
            Building footprints from OpenStreetMap
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
