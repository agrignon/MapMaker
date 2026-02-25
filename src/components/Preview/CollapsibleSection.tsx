import { useState } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

interface CollapsibleSectionProps {
  label: string;
  summary?: string;
  toggle?: ToggleProps;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  label,
  summary,
  toggle,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  function handleHeaderClick() {
    setIsOpen((prev) => !prev);
  }

  function handleToggleClick(e: React.MouseEvent) {
    // Stop propagation so clicking the toggle pill doesn't expand/collapse the section
    e.stopPropagation();
  }

  return (
    <div
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: isOpen ? '12px' : '0',
      }}
    >
      {/* Header row */}
      <div
        onClick={handleHeaderClick}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          padding: '10px 0',
          userSelect: 'none',
        }}
      >
        {/* Left side: chevron + label + optional summary when collapsed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                color: '#9ca3af',
                fontSize: '10px',
                display: 'inline-block',
                transition: 'transform 0.15s ease',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              &#9658;
            </span>
            <span
              style={{
                color: '#e5e7eb',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {label}
            </span>
          </div>
          {!isOpen && summary && (
            <span
              style={{
                color: '#6b7280',
                fontSize: '11px',
                marginLeft: '16px',
              }}
            >
              {summary}
            </span>
          )}
        </div>

        {/* Right side: optional toggle pill */}
        {toggle && (
          <div onClick={handleToggleClick}>
            <button
              role="switch"
              aria-checked={toggle.checked}
              onClick={() => !toggle.disabled && toggle.onChange(!toggle.checked)}
              style={{
                width: '32px',
                height: '18px',
                borderRadius: '9px',
                border: 'none',
                cursor: toggle.disabled ? 'not-allowed' : 'pointer',
                opacity: toggle.disabled ? 0.5 : 1,
                backgroundColor: toggle.checked ? '#2563eb' : '#374151',
                position: 'relative',
                padding: 0,
                flexShrink: 0,
                transition: 'background-color 0.15s ease',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  position: 'absolute',
                  top: '3px',
                  left: toggle.checked ? '17px' : '3px',
                  transition: 'left 0.15s ease',
                }}
              />
            </button>
          </div>
        )}
      </div>

      {/* Body — hidden when collapsed */}
      {isOpen && (
        <div style={{ paddingBottom: '4px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
