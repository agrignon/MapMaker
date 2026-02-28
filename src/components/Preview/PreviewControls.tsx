import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';

export function PreviewControls() {
  return (
    <>
      <OrbitControls makeDefault />

      {/* Ground grid on XY plane (Z-up scene) — sized for mm-scale terrain */}
      <gridHelper
        args={[400, 20, '#666', '#444']}
        rotation={[Math.PI / 2, 0, 0]}
      />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>

      <ambientLight intensity={0.5} />
      <directionalLight position={[200, -200, 400]} intensity={1.2} />
    </>
  );
}
