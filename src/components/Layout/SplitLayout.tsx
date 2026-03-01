import { useCallback, useRef, useState, useEffect } from 'react';
import { useMapStore } from '../../store/mapStore';
import { PreviewCanvas } from '../Preview/PreviewCanvas';
import { PreviewSidebar } from '../Preview/PreviewSidebar';
import { triggerRegenerate } from '../Sidebar/GenerateButton';

interface SplitLayoutProps {
  children: React.ReactNode;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

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

function MobileTabBar({ activeTab, onTabChange }: { activeTab: 'map' | 'preview'; onTabChange: (tab: 'map' | 'preview') => void }) {
  const showPreview = useMapStore((s) => s.showPreview);

  if (!showPreview) return null;

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid #374151',
        backgroundColor: '#111827',
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => onTabChange('map')}
        style={{
          flex: 1,
          padding: '10px 0',
          fontSize: '13px',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: activeTab === 'map' ? '#1f2937' : 'transparent',
          color: activeTab === 'map' ? '#fff' : '#6b7280',
          borderBottom: activeTab === 'map' ? '2px solid #3b82f6' : '2px solid transparent',
          transition: 'all 0.15s',
        }}
      >
        Map
      </button>
      <button
        onClick={() => onTabChange('preview')}
        style={{
          flex: 1,
          padding: '10px 0',
          fontSize: '13px',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: activeTab === 'preview' ? '#1f2937' : 'transparent',
          color: activeTab === 'preview' ? '#fff' : '#6b7280',
          borderBottom: activeTab === 'preview' ? '2px solid #3b82f6' : '2px solid transparent',
          transition: 'all 0.15s',
        }}
      >
        3D Preview
      </button>
    </div>
  );
}

export function SplitLayout({ children }: SplitLayoutProps) {
  const showPreview = useMapStore((state) => state.showPreview);
  const isMobile = useIsMobile();
  const [splitPercent, setSplitPercent] = useState(50);
  const [activeTab, setActiveTab] = useState<'map' | 'preview'>('map');
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

  useEffect(() => {
    if (showPreview && isMobile) {
      setActiveTab('preview');
    }
  }, [showPreview, isMobile]);

  if (isMobile) {
    return (
      <div ref={containerRef} className="flex-1 h-full flex flex-col">
        <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <div style={{ flex: 1, position: 'relative', display: (!showPreview || activeTab === 'map') ? 'block' : 'none' }}>
          {children}
        </div>
        {showPreview && (
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: activeTab === 'preview' ? 'block' : 'none',
              overflow: 'hidden',
            }}
          >
            <StaleIndicator />
            <PreviewCanvas />
            <PreviewSidebar />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 h-full flex">
      <div style={{ width: showPreview ? `${splitPercent}%` : '100%', minWidth: 0, height: '100%', position: 'relative' }}>
        {children}
      </div>

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
