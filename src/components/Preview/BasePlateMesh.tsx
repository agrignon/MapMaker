/**
 * Base plate rendered below the terrain in the R3F Canvas.
 * A simple box that sits at Z < 0, matching the solid mesh export.
 */

import { useMapStore } from '../../store/mapStore';

export function BasePlateMesh() {
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const basePlateThicknessMM = useMapStore((s) => s.basePlateThicknessMM);
  const elevationData = useMapStore((s) => s.elevationData);

  if (!elevationData) return null;

  return (
    <mesh position={[0, 0, -basePlateThicknessMM / 2]}>
      <boxGeometry args={[targetWidthMM, targetDepthMM, basePlateThicknessMM]} />
      <meshStandardMaterial color="#6b7280" />
    </mesh>
  );
}
