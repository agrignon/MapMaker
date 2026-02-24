import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useMapStore } from '../../store/mapStore';

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
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '1rem',
            }}
          >
            3D Preview
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
