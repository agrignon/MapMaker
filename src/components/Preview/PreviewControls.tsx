/**
 * R3F scene controls — must be rendered inside a <Canvas> context.
 * Provides orbit controls, a ground grid, an axes gizmo, and scene lighting.
 */

import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';

export function PreviewControls() {
  return (
    <>
      <OrbitControls makeDefault />
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellColor="#444"
        sectionSize={5}
        sectionColor="#666"
        fadeDistance={50}
      />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>
      <ambientLight intensity={0.4} />
      <directionalLight position={[1, 1, 2]} intensity={1.2} />
    </>
  );
}
