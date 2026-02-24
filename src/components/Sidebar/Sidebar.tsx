/**
 * Sidebar shell component. Displays the app title and a placeholder prompt.
 * Extended in Plan 02 with SelectionInfo and GenerateButton once bbox state is active.
 */
export function Sidebar() {
  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        MapMaker
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Search for a location and draw a bounding box to get started.
      </p>
    </div>
  );
}
