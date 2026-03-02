import { useState } from 'react';
import { ModelControlsPanel } from '../Panels/ModelControlsPanel';

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
            width: 'min(240px, calc(100vw - 44px))',
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
          <ModelControlsPanel />
        </div>
      )}
    </div>
  );
}
