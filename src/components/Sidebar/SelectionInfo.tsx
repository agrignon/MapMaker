import { useMapStore } from '../../store/mapStore';

const KM_THRESHOLD = 1000;

function formatDimension(meters: number): string {
  if (meters < KM_THRESHOLD) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatCoord(value: number, decimalPlaces = 4): string {
  return value.toFixed(decimalPlaces);
}

const cardStyle: React.CSSProperties = {
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '8px 10px',
  backgroundColor: 'rgba(255,255,255,0.04)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'rgba(255,255,255,0.45)',
  marginBottom: '2px',
};

const valueStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'rgba(255,255,255,0.85)',
};

export function SelectionInfo() {
  const bbox = useMapStore((s) => s.bbox);
  const dimensions = useMapStore((s) => s.dimensions);
  const utmZone = useMapStore((s) => s.utmZone);

  if (!bbox || !dimensions) return null;

  const { sw, ne } = bbox;
  const { widthM, heightM } = dimensions;
  const showLargeAreaWarning = widthM > 5000 || heightM > 5000;
  const centroidLat = (sw.lat + ne.lat) / 2;
  const hemisphere = centroidLat >= 0 ? 'N' : 'S';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={cardStyle}>
        <p style={labelStyle}>Dimensions</p>
        <p style={{ ...valueStyle, fontWeight: 500, fontSize: '14px', margin: 0 }}>
          {formatDimension(widthM)} &times; {formatDimension(heightM)}
        </p>
      </div>

      <div style={cardStyle}>
        <p style={labelStyle}>Coordinates</p>
        <p style={{ ...valueStyle, margin: '0 0 2px' }}>
          <span style={{ fontWeight: 500 }}>SW:</span> {formatCoord(sw.lat)}, {formatCoord(sw.lon)}
        </p>
        <p style={{ ...valueStyle, margin: 0 }}>
          <span style={{ fontWeight: 500 }}>NE:</span> {formatCoord(ne.lat)}, {formatCoord(ne.lon)}
        </p>
      </div>

      {utmZone !== null && (
        <div style={cardStyle}>
          <p style={labelStyle}>Projection</p>
          <p style={{ ...valueStyle, margin: 0 }}>UTM Zone {utmZone}{hemisphere}</p>
        </div>
      )}

      {showLargeAreaWarning && (
        <div style={{ ...cardStyle, border: '1px solid rgba(251, 191, 36, 0.4)', backgroundColor: 'rgba(251, 191, 36, 0.1)' }}>
          <p style={{ fontSize: '11px', color: 'rgba(251, 191, 36, 0.85)', margin: 0, lineHeight: 1.4 }}>
            Large area selected — processing may take longer.
          </p>
        </div>
      )}
    </div>
  );
}
