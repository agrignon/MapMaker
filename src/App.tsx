import { Sidebar } from './components/Sidebar/Sidebar';
import { MapView } from './components/Map/MapView';
import { SplitLayout } from './components/Layout/SplitLayout';

function App() {
  return (
    <div className="h-screen flex">
      <Sidebar />
      <SplitLayout>
        <div className="relative w-full h-full">
          <MapView />
        </div>
      </SplitLayout>
    </div>
  );
}

export default App;
