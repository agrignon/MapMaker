import { useState } from 'react';
import { useMapStore } from '../../store/mapStore';

const MM_PER_INCH = 25.4;

function toDisplayUnit(valueMM: number, units: 'mm' | 'in'): number {
  return units === 'in' ? valueMM / MM_PER_INCH : valueMM;
}

function toStoreMM(displayValue: number, units: 'mm' | 'in'): number {
  return units === 'in' ? displayValue * MM_PER_INCH : displayValue;
}

function formatDisplay(valueMM: number, units: 'mm' | 'in', decimals = 1): string {
  const v = toDisplayUnit(valueMM, units);
  return units === 'in' ? v.toFixed(2) : v.toFixed(decimals === 0 ? 0 : 1);
}

export function ModelSizeSection() {
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const units = useMapStore((s) => s.units);
  const dimensions = useMapStore((s) => s.dimensions);
  const elevationData = useMapStore((s) => s.elevationData);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const basePlateThicknessMM = useMapStore((s) => s.basePlateThicknessMM);

  const setTargetWidth = useMapStore((s) => s.setTargetWidth);
  const setTargetHeightMM = useMapStore((s) => s.setTargetHeightMM);
  const setUnits = useMapStore((s) => s.setUnits);

  // Local string state for keystroke buffering — committed to store on blur
  const [widthInput, setWidthInput] = useState(() =>
    formatDisplay(targetWidthMM, units)
  );
  const [heightInput, setHeightInput] = useState(() =>
    targetHeightMM === 0 ? '' : formatDisplay(targetHeightMM, units)
  );

  // Auto-calculated height based on terrain data
  function computeAutoHeightMM(): number {
    if (!elevationData || !dimensions) return 0;
    const elevRange = elevationData.maxElevation - elevationData.minElevation;
    const horizontalScale = targetWidthMM / (dimensions.widthM * 1000); // mm per mm
    const naturalHeightMM = elevRange * horizontalScale * exaggeration;
    const terrainHeightMM = naturalHeightMM < 5 ? 5 : naturalHeightMM;
    return terrainHeightMM + basePlateThicknessMM;
  }

  const autoHeightMM = computeAutoHeightMM();

  function handleWidthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setWidthInput(raw);
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0) {
      const mmValue = toStoreMM(v, units);
      const clamped = Math.max(10, Math.min(500, mmValue));
      setTargetWidth(clamped);
    }
  }

  function handleWidthBlur() {
    const v = parseFloat(widthInput);
    if (!isNaN(v) && v > 0) {
      const mmValue = toStoreMM(v, units);
      const clamped = Math.max(10, Math.min(500, mmValue));
      setTargetWidth(clamped);
      setWidthInput(formatDisplay(clamped, units));
    } else {
      setWidthInput(formatDisplay(targetWidthMM, units));
    }
  }

  function handleHeightChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setHeightInput(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setTargetHeightMM(0);
    } else {
      const v = parseFloat(trimmed);
      if (!isNaN(v) && v > 0) {
        const mmValue = toStoreMM(v, units);
        const clamped = Math.max(1, Math.min(200, mmValue));
        setTargetHeightMM(clamped);
      }
    }
  }

  function handleHeightBlur() {
    const trimmed = heightInput.trim();
    if (trimmed === '') {
      setTargetHeightMM(0);
    } else {
      const v = parseFloat(trimmed);
      if (!isNaN(v) && v > 0) {
        const mmValue = toStoreMM(v, units);
        const clamped = Math.max(1, Math.min(200, mmValue));
        setTargetHeightMM(clamped);
        setHeightInput(formatDisplay(clamped, units));
      } else {
        setHeightInput(targetHeightMM === 0 ? '' : formatDisplay(targetHeightMM, units));
      }
    }
  }

  // Sync local state when units change
  function handleUnitsChange(newUnits: 'mm' | 'in') {
    setUnits(newUnits);
    setWidthInput(formatDisplay(targetWidthMM, newUnits));
    setHeightInput(targetHeightMM === 0 ? '' : formatDisplay(targetHeightMM, newUnits));
  }

  const unitLabel = units === 'mm' ? 'mm' : 'in';

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#e5e7eb',
    padding: '6px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '80px',
    textAlign: 'right' as const,
  };

  const labelStyle: React.CSSProperties = {
    color: '#d1d5db',
    fontSize: '13px',
    fontWeight: 500,
    minWidth: '60px',
  };

  // Summary line values
  const displayWidth = toDisplayUnit(targetWidthMM, units);
  const displayDepth = toDisplayUnit(targetDepthMM, units);
  const displayHeight = targetHeightMM === 0 ? toDisplayUnit(autoHeightMM, units) : toDisplayUnit(targetHeightMM, units);
  const summaryDecimals = units === 'in' ? 2 : 1;
  const summaryStr = `${displayWidth.toFixed(summaryDecimals)} \u00d7 ${displayDepth.toFixed(summaryDecimals)} \u00d7 ${displayHeight.toFixed(summaryDecimals)} ${unitLabel}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Unit toggle — segmented control */}
      <div style={{ display: 'flex', gap: '0' }}>
        <button
          onClick={() => handleUnitsChange('mm')}
          style={{
            flex: 1,
            padding: '5px 0',
            fontSize: '12px',
            fontWeight: 600,
            border: '1px solid #374151',
            borderRadius: '6px 0 0 6px',
            cursor: 'pointer',
            backgroundColor: units === 'mm' ? '#2563eb' : '#1f2937',
            color: units === 'mm' ? '#fff' : '#9ca3af',
            transition: 'background-color 0.15s ease',
          }}
        >
          mm
        </button>
        <button
          onClick={() => handleUnitsChange('in')}
          style={{
            flex: 1,
            padding: '5px 0',
            fontSize: '12px',
            fontWeight: 600,
            border: '1px solid #374151',
            borderLeft: 'none',
            borderRadius: '0 6px 6px 0',
            cursor: 'pointer',
            backgroundColor: units === 'in' ? '#2563eb' : '#1f2937',
            color: units === 'in' ? '#fff' : '#9ca3af',
            transition: 'background-color 0.15s ease',
          }}
        >
          in
        </button>
      </div>

      {/* Width (X) input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="model-width" style={labelStyle}>Width (X)</label>
        <input
          id="model-width"
          type="number"
          min={units === 'in' ? 0.4 : 10}
          max={units === 'in' ? 19.7 : 500}
          step={units === 'in' ? 0.1 : 1}
          value={widthInput}
          onChange={handleWidthChange}
          onBlur={handleWidthBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={inputStyle}
        />
        <span style={{ color: '#9ca3af', fontSize: '13px' }}>{unitLabel}</span>
      </div>

      {/* Depth (Y) — auto-computed from width to preserve geographic aspect ratio */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={labelStyle}>Depth (Y)</span>
        <span
          style={{
            ...inputStyle,
            display: 'inline-block',
            color: '#6b7280',
            cursor: 'default',
          }}
          title="Auto-computed from width to preserve map aspect ratio"
        >
          {formatDisplay(targetDepthMM, units)}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '13px' }}>{unitLabel}</span>
        <span style={{ color: '#6b7280', fontSize: '11px', fontStyle: 'italic' }}>auto</span>
      </div>

      {/* Height (Z) input with auto placeholder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="model-height" style={labelStyle}>Height (Z)</label>
        <input
          id="model-height"
          type="number"
          min={0}
          max={units === 'in' ? 7.9 : 200}
          step={units === 'in' ? 0.1 : 1}
          value={heightInput}
          placeholder={autoHeightMM > 0 ? formatDisplay(autoHeightMM, units) : 'auto'}
          onChange={handleHeightChange}
          onBlur={handleHeightBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{
            ...inputStyle,
            color: heightInput === '' ? '#6b7280' : '#e5e7eb',
          }}
        />
        <span style={{ color: '#9ca3af', fontSize: '13px' }}>{unitLabel}</span>
      </div>

      {/* Summary line */}
      <p style={{ color: '#6b7280', fontSize: '11px', margin: 0 }}>
        {summaryStr}
      </p>
    </div>
  );
}
