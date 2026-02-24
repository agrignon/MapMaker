import { useMapStore } from '../../store/mapStore';
import { SelectionInfo } from './SelectionInfo';
import { GenerateButton } from './GenerateButton';

/**
 * Application sidebar.
 *
 * Layout:
 *  - Header: app title
 *  - Body (flex-1 scroll): SelectionInfo when bbox exists, else instruction placeholder
 *  - Footer (pinned): GenerateButton
 */
export function Sidebar() {
  const hasBbox = useMapStore((s) => s.bbox !== null);

  return (
    <aside className="w-[300px] h-screen flex flex-col bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          MapMaker
        </h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {hasBbox ? (
          <SelectionInfo />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Search for a location, then <strong>Shift+drag</strong> on the map to draw a bounding box.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        <GenerateButton />
      </div>
    </aside>
  );
}
