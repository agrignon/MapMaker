/**
 * R3F Canvas for the 3D terrain preview.
 * Dark background, Z-up camera, overhead angle.
 * Renders PreviewControls (lights, grid, gizmo, orbit) and TerrainMesh.
 */

import { Canvas } from '@react-three/fiber';
import { PreviewControls } from './PreviewControls';
import { TerrainMesh } from './TerrainMesh';

export function PreviewCanvas() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%', background: '#1a1a1a' }}
      camera={{
        position: [200, -300, 250],
        fov: 50,
        near: 0.1,
        far: 100000,
        up: [0, 0, 1],
      }}
    >
      <PreviewControls />
      <TerrainMesh />
    </Canvas>
  );
}
