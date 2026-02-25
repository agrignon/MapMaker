import { useCallback, useRef, useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import { PreviewCanvas } from '../Preview/PreviewCanvas';
import { PreviewSidebar } from '../Preview/PreviewSidebar';

interface SplitLayoutProps {
  children: React.ReactNode;
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
      {showPreview && (
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
          }}
        />
      )}

      {/* Right panel: 3D preview */}
      {showPreview && (
        <div style={{ width: `${100 - splitPercent}%`, minWidth: 0, height: '100%', position: 'relative' }}>
          <PreviewCanvas />
          <PreviewSidebar />
        </div>
      )}
    </div>
  );
}
