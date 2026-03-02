import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { MapView } from './components/Map/MapView';
import { SplitLayout } from './components/Layout/SplitLayout';
import { useBreakpoint } from './hooks/useBreakpoint';
import { useMapStore } from './store/mapStore';
import { DevBadge } from './components/DevBadge/DevBadge';

function App() {
  const tier = useBreakpoint();
  const setDeviceTier = useMapStore((s) => s.setDeviceTier);

  useEffect(() => {
    setDeviceTier(tier);
  }, [tier, setDeviceTier]);

  return (
    <div style={{ height: '100dvh', display: 'flex' }}>
      <SplitLayout>
        <div className="relative w-full h-full">
          <MapView />
          <Sidebar />
        </div>
      </SplitLayout>
      <DevBadge />
    </div>
  );
}

export default App;
