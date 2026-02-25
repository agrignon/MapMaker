import { useState } from 'react';
import { ModelSizeSection } from './ModelSizeSection';
import { TerrainSection } from './TerrainSection';
import { BuildingsSection } from './BuildingsSection';
import { RoadsSection } from './RoadsSection';
import { LayerPlaceholderSection } from './LayerPlaceholderSection';
import { ExportPanel } from './ExportPanel';

export function PreviewSidebar() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'flex-start',
        pointerEvents: 'none',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Collapse controls' : 'Expand controls'}
        style={{
          pointerEvents: 'auto',
          marginTop: '16px',
          width: '28px',
          height: '48px',
          backgroundColor: 'rgba(17, 24, 39, 0.6)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRight: isOpen ? 'none' : undefined,
          borderRadius: isOpen ? '6px 0 0 6px' : '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#d1d5db',
          fontSize: '12px',
          flexShrink: 0,
        }}
      >
        {isOpen ? '›' : '‹'}
      </button>

      {/* Expandable panel — transparent overlay */}
      {isOpen && (
        <div
          style={{
            pointerEvents: 'auto',
            width: '240px',
            maxHeight: '100%',
            backgroundColor: 'rgba(17, 24, 39, 0.55)',
            backdropFilter: 'blur(12px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '-4px 0 16px rgba(0,0,0,0.3)',
            padding: '14px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '13px' }}>
              Model Controls
            </span>
          </div>

          {/* Model Size section — always visible above layers */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', paddingTop: '8px' }}>
            <ModelSizeSection />
          </div>

          {/* Layers subheading */}
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            <span style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Layers
            </span>
          </div>

          {/* Layer sections in pipeline order */}
          <TerrainSection />
          <BuildingsSection />
          <RoadsSection />
          <LayerPlaceholderSection label="Water" />
          <LayerPlaceholderSection label="Vegetation" />

          {/* Divider before export */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px' }} />

          {/* Export panel at bottom */}
          <ExportPanel />
        </div>
      )}
    </div>
  );
}
