import { useCallback, useRef, useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import { PreviewCanvas } from '../Preview/PreviewCanvas';
import { PreviewSidebar } from '../Preview/PreviewSidebar';
import { triggerRegenerate } from '../Sidebar/GenerateButton';

interface SplitLayoutProps {
  children: React.ReactNode;
}

/**
 * Amber banner shown in the preview panel when the user has moved/resized the
 * bbox after the last successful generate. Prompts them to regenerate.
 */
function StaleIndicator() {
  const generatedBboxKey = useMapStore((s) => s.generatedBboxKey);
  const bbox = useMapStore((s) => s.bbox);
  const showPreview = useMapStore((s) => s.showPreview);
  const generationStatus = useMapStore((s) => s.generationStatus);

  const currentBboxKey = bbox
    ? `${bbox.sw.lat.toFixed(5)},${bbox.sw.lon.toFixed(5)},${bbox.ne.lat.toFixed(5)},${bbox.ne.lon.toFixed(5)}`
    : null;

  const isStale =
    showPreview &&
    generatedBboxKey !== null &&
    currentBboxKey !== null &&
    currentBboxKey !== generatedBboxKey;

  const isLoading = generationStatus === 'fetching' || generationStatus === 'meshing';

  if (!isStale || isLoading) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.9)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>
        Area changed
      </span>
      <button
        onClick={() => { void triggerRegenerate(); }}
        style={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: '4px',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 600,
          padding: '4px 12px',
          cursor: 'pointer',
        }}
      >
        Regenerate
      </button>
    </div>
  );
}

export function SplitLayout({ children }: SplitLayoutProps) {
  const showPreview = useMapStore((state) => state.showPreview);
  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.max(25, Math.min(75, pct)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div ref={containerRef} className="flex-1 h-full flex">
      {/* Left panel: map — always rendered */}
      <div style={{ width: showPreview ? `${splitPercent}%` : '100%', minWidth: 0, height: '100%', position: 'relative' }}>
        {children}
      </div>

      {/* Draggable divider */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          width: '6px',
          cursor: 'col-resize',
          backgroundColor: '#4b5563',
          flexShrink: 0,
          touchAction: 'none',
          display: showPreview ? 'flex' : 'none',
        }}
      />

      {/* Right panel: 3D preview — always mounted to preserve R3F Canvas (avoid WebGL teardown) */}
      <div
        style={{
          width: showPreview ? `${100 - splitPercent}%` : '0%',
          minWidth: 0,
          height: '100%',
          position: 'relative',
          visibility: showPreview ? 'visible' : 'hidden',
          overflow: 'hidden',
          pointerEvents: showPreview ? 'auto' : 'none',
        }}
      >
        <StaleIndicator />
        <PreviewCanvas />
        <PreviewSidebar />
      </div>
    </div>
  );
}
