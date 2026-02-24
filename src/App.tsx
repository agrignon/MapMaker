import { Sidebar } from './components/Sidebar/Sidebar';
import { MapView } from './components/Map/MapView';

function App() {
  return (
    <div className="h-screen flex">
      <div className="w-[300px] flex-shrink-0 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <Sidebar />
      </div>
      <div className="flex-1 relative">
        <MapView />
      </div>
    </div>
  );
}

export default App;
