import { useCallback, useRef, useState, useLayoutEffect } from 'react';
import { useMapStore } from '../../store/mapStore';
import { PreviewCanvas } from '../Preview/PreviewCanvas';
import { PreviewSidebar } from '../Preview/PreviewSidebar';
import { triggerRegenerate } from '../Sidebar/GenerateButton';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { MobileViewToggle } from '../MobileViewToggle/MobileViewToggle';

interface SplitLayoutProps {
  children: React.ReactNode;
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

export function SplitLayout({ children }: SplitLayoutProps) {
  const showPreview = useMapStore((state) => state.showPreview);
  const tier = useBreakpoint();
  const isMobile = tier === 'mobile';
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

  const prevShowPreview = useRef(showPreview);
  const prevIsMobile = useRef(isMobile);
  useLayoutEffect(() => {
    // Case 1: showPreview just turned on while already mobile → show preview tab
    if (showPreview && !prevShowPreview.current && isMobile) {
      setActiveTab('preview');
    }
    // Case 2: just transitioned TO mobile while showPreview is already true → show preview tab
    if (isMobile && !prevIsMobile.current && showPreview) {
      setActiveTab('preview');
    }
    // Case 3: showPreview turned off while mobile → back to map tab
    if (!showPreview && isMobile) {
      setActiveTab('map');
    }
    prevShowPreview.current = showPreview;
    prevIsMobile.current = isMobile;
  }, [showPreview, isMobile]);

  // Toggle callback for MobileViewToggle
  const handleViewToggle = useCallback(() => {
    setActiveTab((prev) => (prev === 'map' ? 'preview' : 'map'));
  }, []);

  // Unified tree: PreviewCanvas stays at the same React tree position
  // across mobile/desktop transitions, preserving the WebGL context.
  const mapVisible = !showPreview || !isMobile || activeTab === 'map';
  const previewVisible = showPreview && (!isMobile || activeTab === 'preview');

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full"
      style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}
    >
      <div
        key="content"
        style={isMobile
          ? { flex: 1, position: 'relative' }
          : { display: 'flex', flex: 1, width: '100%', height: '100%' }
        }
      >
        {/* Map pane */}
        <div style={isMobile ? {
          position: 'absolute',
          inset: 0,
          visibility: mapVisible ? 'visible' : 'hidden',
          zIndex: mapVisible ? 1 : 0,
        } : {
          width: showPreview ? `${splitPercent}%` : '100%',
          minWidth: 0,
          height: '100%',
          position: 'relative',
        }}>
          {children}
        </div>

        {/* Divider — always in tree to keep preview pane at stable index */}
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
            display: (!isMobile && showPreview) ? 'flex' : 'none',
          }}
        />

        {/* Preview pane — stable tree position preserves R3F WebGL context */}
        <div style={isMobile ? {
          position: 'absolute',
          inset: 0,
          visibility: previewVisible ? 'visible' : 'hidden',
          overflow: 'hidden',
          zIndex: previewVisible ? 1 : 0,
        } : {
          width: showPreview ? `${100 - splitPercent}%` : '0%',
          minWidth: 0,
          height: '100%',
          position: 'relative',
          visibility: showPreview ? 'visible' : 'hidden',
          overflow: 'hidden',
          pointerEvents: showPreview ? 'auto' : 'none',
        }}>
          <StaleIndicator />
          <PreviewCanvas />
          <PreviewSidebar />
        </div>

        {/* MobileViewToggle — sibling to panes, floats above both via position:absolute + zIndex:20 */}
        {isMobile && showPreview && (
          <MobileViewToggle activeView={activeTab} onToggle={handleViewToggle} />
        )}
      </div>
    </div>
  );
}
