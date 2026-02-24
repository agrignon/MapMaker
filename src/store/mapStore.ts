import { create } from 'zustand';
import { BoundingBox, BboxDimensions } from '../types/geo';
import { bboxDimensionsMeters, getUTMZone } from '../lib/utm';

interface MapState {
  bbox: BoundingBox | null;
  utmZone: number | null;
  dimensions: BboxDimensions | null;
}

interface MapActions {
  setBbox: (sw: { lon: number; lat: number }, ne: { lon: number; lat: number }) => void;
  clearBbox: () => void;
}

type MapStore = MapState & MapActions;

export const useMapStore = create<MapStore>((set) => ({
  bbox: null,
  utmZone: null,
  dimensions: null,

  setBbox: (sw, ne) => {
    const bbox: BoundingBox = { sw, ne };
    const centroidLon = (sw.lon + ne.lon) / 2;
    const utmZone = getUTMZone(centroidLon);
    const dimensions = bboxDimensionsMeters(
      [sw.lon, sw.lat],
      [ne.lon, ne.lat]
    );
    set({ bbox, utmZone, dimensions });
  },

  clearBbox: () => {
    set({ bbox: null, utmZone: null, dimensions: null });
  },
}));
