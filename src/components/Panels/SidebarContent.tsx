import { useMapStore } from '../../store/mapStore';
import { MapControlsPanel } from './MapControlsPanel';
import { ModelControlsPanel } from './ModelControlsPanel';

export function SidebarContent() {
  const deviceTier = useMapStore((s) => s.deviceTier);
  const mobileActiveView = useMapStore((s) => s.mobileActiveView);
  const showPreview = useMapStore((s) => s.showPreview);

  // On mobile, switch to model controls when viewing the 3D preview
  if (deviceTier === 'mobile' && showPreview && mobileActiveView === 'preview') {
    return <ModelControlsPanel />;
  }

  return <MapControlsPanel />;
}
