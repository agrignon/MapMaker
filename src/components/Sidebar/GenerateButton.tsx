import { useMapStore } from '../../store/mapStore';

/**
 * Generate Preview button — always disabled in Phase 1.
 *
 * Shows "Select an area first" hint text when no bbox exists,
 * and "Generate Preview" once a bbox is selected. Remains disabled
 * throughout Phase 1 until Phase 2 mesh generation is implemented.
 */
export function GenerateButton() {
  const hasBbox = useMapStore((s) => s.bbox !== null);

  return (
    <div className="space-y-1">
      <button
        disabled
        type="button"
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white
                   opacity-50 cursor-not-allowed
                   focus:outline-none"
        title="Available after Phase 2"
      >
        {hasBbox ? 'Generate Preview' : 'Select an area first'}
      </button>
      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        Available after Phase 2
      </p>
    </div>
  );
}
