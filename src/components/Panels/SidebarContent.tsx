import { useMapStore } from '../../store/mapStore';
import { MapControlsPanel } from './MapControlsPanel';
import { ModelControlsPanel } from './ModelControlsPanel';

export function SidebarContent() {
  const showPreview = useMapStore((s) => s.showPreview);

  return showPreview ? <ModelControlsPanel /> : <MapControlsPanel />;
}
