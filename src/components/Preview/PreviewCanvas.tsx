import { Canvas } from '@react-three/fiber';
import { PreviewControls } from './PreviewControls';
import { TerrainMesh } from './TerrainMesh';
import { BuildingMesh } from './BuildingMesh';
import { RoadMesh } from './RoadMesh';
import { WaterMesh } from './WaterMesh';
import { BasePlateMesh } from './BasePlateMesh';
import { Component, type ReactNode } from 'react';
import { useMapStore } from '../../store/mapStore';

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

/** Indeterminate progress bar shown during expensive layer rebuilds */
function RebuildOverlay() {
  const rebuildingLayers = useMapStore((s) => s.rebuildingLayers);
  if (!rebuildingLayers) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 14px',
          backgroundColor: 'rgba(17, 24, 39, 0.85)',
          borderTop: '1px solid rgba(55, 65, 81, 0.6)',
        }}
      >
        <div
          style={{
            flex: 1,
            height: '4px',
            borderRadius: '2px',
            backgroundColor: 'rgba(55, 65, 81, 0.8)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '40%',
              height: '100%',
              borderRadius: '2px',
              backgroundColor: '#3b82f6',
              animation: 'rebuildSlide 1.2s ease-in-out infinite',
            }}
          />
        </div>
        <span style={{ color: '#9ca3af', fontSize: '12px', whiteSpace: 'nowrap' }}>
          {rebuildingLayers}
        </span>
      </div>
      <style>{`
        @keyframes rebuildSlide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
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
          <RoadMesh />
          <WaterMesh />
          <BasePlateMesh />
        </SceneErrorBoundary>
      </Canvas>
      <RebuildOverlay />
    </div>
  );
}
