import { Sidebar } from './components/Sidebar/Sidebar';
import { MapView } from './components/Map/MapView';
import { SplitLayout } from './components/Layout/SplitLayout';

function App() {
  return (
    <div style={{ height: '100dvh', display: 'flex' }}>
      <SplitLayout>
        <div className="relative w-full h-full">
          <MapView />
          <Sidebar />
        </div>
      </SplitLayout>
    </div>
  );
}

export default App;
