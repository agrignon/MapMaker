import { Sidebar } from './components/Sidebar/Sidebar';
import { MapView } from './components/Map/MapView';

function App() {
  return (
    <div className="h-screen flex">
      <Sidebar />
      <div className="flex-1 relative">
        <MapView />
      </div>
    </div>
  );
}

export default App;
