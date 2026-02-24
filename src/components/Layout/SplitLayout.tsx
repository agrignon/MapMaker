import { useMapStore } from '../../store/mapStore';
import { PreviewCanvas } from '../Preview/PreviewCanvas';
import { PreviewSidebar } from '../Preview/PreviewSidebar';
import { TerrainControls } from '../Preview/TerrainControls';
import { ExportPanel } from '../Preview/ExportPanel';

interface SplitLayoutProps {
  children: React.ReactNode;
}

export function SplitLayout({ children }: SplitLayoutProps) {
  const showPreview = useMapStore((state) => state.showPreview);

  return (
    <div className="flex-1 h-full flex">
      {/* Left panel: map — always rendered, never unmounted */}
      <div style={{ flex: showPreview ? '1 1 50%' : '1 1 100%', minWidth: 0, height: '100%', position: 'relative' }}>
        {children}
      </div>

      {/* Drag handle — only when preview is visible */}
      {showPreview && (
        <div
          style={{
            width: '4px',
            cursor: 'col-resize',
            backgroundColor: '#4b5563',
            flexShrink: 0,
          }}
        />
      )}

      {/* Right panel: 3D preview — only when preview is visible */}
      {showPreview && (
        <div style={{ flex: '1 1 50%', minWidth: 0, height: '100%', position: 'relative' }}>
          <PreviewCanvas />
          <PreviewSidebar>
            <TerrainControls />
            <ExportPanel />
          </PreviewSidebar>
        </div>
      )}
    </div>
  );
}
