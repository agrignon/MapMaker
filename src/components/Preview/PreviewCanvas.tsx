import { Canvas } from '@react-three/fiber';
import { PreviewControls } from './PreviewControls';
import { TerrainMesh } from './TerrainMesh';
import { BuildingMesh } from './BuildingMesh';
import { BasePlateMesh } from './BasePlateMesh';
import { Component, type ReactNode } from 'react';

/** Catch R3F render errors so they don't produce a silent black screen */
class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }

  render() {
    if (this.state.error) {
      return (
        <mesh>
          <boxGeometry args={[30, 30, 30]} />
          <meshBasicMaterial color="red" />
        </mesh>
      );
    }
    return this.props.children;
  }
}

export function PreviewCanvas() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        style={{ background: '#1a1a1a' }}
        gl={{ localClippingEnabled: true }}
        camera={{
          position: [200, -300, 250],
          fov: 50,
          near: 0.1,
          far: 100000,
          up: [0, 0, 1],
        }}
      >
        <SceneErrorBoundary>
          <PreviewControls />
          <TerrainMesh />
          <BuildingMesh />
          <BasePlateMesh />
        </SceneErrorBoundary>
      </Canvas>
    </div>
  );
}
