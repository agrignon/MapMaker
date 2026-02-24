import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useMapStore } from '../../store/mapStore';
import { PreviewCanvas } from '../Preview/PreviewCanvas';
import { PreviewSidebar } from '../Preview/PreviewSidebar';
import { TerrainControls } from '../Preview/TerrainControls';

interface SplitLayoutProps {
  children: React.ReactNode;
}

export function SplitLayout({ children }: SplitLayoutProps) {
  const showPreview = useMapStore((state) => state.showPreview);

  if (!showPreview) {
    return (
      <div className="flex-1 h-full">
        {children}
      </div>
    );
  }

  return (
    <div className="flex-1 h-full">
      <PanelGroup direction="horizontal" style={{ height: '100%' }}>
        <Panel defaultSize={50} minSize={25}>
          {children}
        </Panel>
        <PanelResizeHandle
          style={{
            width: '4px',
            backgroundColor: '#4b5563',
            cursor: 'col-resize',
          }}
        />
        <Panel defaultSize={50} minSize={25}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <PreviewCanvas />
            <PreviewSidebar>
              <TerrainControls />
            </PreviewSidebar>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
