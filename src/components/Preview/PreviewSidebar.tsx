/**
 * Collapsible sidebar overlaying the 3D preview panel.
 * Houses terrain controls and (future) export controls.
 * Positioned on the right edge of the 3D preview area.
 */

import { useState } from 'react';

interface PreviewSidebarProps {
  children: React.ReactNode;
}

export function PreviewSidebar({ children }: PreviewSidebarProps) {
  // Default expanded so controls are visible when terrain is first generated
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
      {/* Toggle button — always visible at the edge */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Collapse controls' : 'Expand controls'}
        style={{
          pointerEvents: 'auto',
          marginTop: '16px',
          marginRight: isOpen ? '0px' : '0px',
          width: '28px',
          height: '48px',
          backgroundColor: '#1f2937',
          border: '1px solid #374151',
          borderRight: isOpen ? 'none' : '1px solid #374151',
          borderRadius: isOpen ? '6px 0 0 6px' : '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: '12px',
          alignSelf: 'flex-start',
          flexShrink: 0,
        }}
      >
        {isOpen ? '›' : '‹'}
      </button>

      {/* Expandable panel */}
      {isOpen && (
        <div
          style={{
            pointerEvents: 'auto',
            width: '280px',
            height: '100%',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            backdropFilter: 'blur(4px)',
            borderLeft: '1px solid #374151',
            boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#e5e7eb', fontWeight: 600, fontSize: '14px' }}>
              Preview Controls
            </span>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
