import { create } from 'zustand';
import { BoundingBox, BboxDimensions, GenerationStatus, ElevationData } from '../types/geo';
import { bboxDimensionsMeters, getUTMZone } from '../lib/utm';

interface MapState {
  bbox: BoundingBox | null;
  utmZone: number | null;
  dimensions: BboxDimensions | null;
  showPreview: boolean;
  generationStatus: GenerationStatus;
  generationStep: string;
  elevationData: ElevationData | null;
  exaggeration: number;
  basePlateThicknessMM: number;
  targetWidthMM: number;
  targetDepthMM: number;
}

interface MapActions {
  setBbox: (sw: { lon: number; lat: number }, ne: { lon: number; lat: number }) => void;
  clearBbox: () => void;
  setShowPreview: (show: boolean) => void;
  setGenerationStatus: (status: GenerationStatus, step?: string) => void;
  setElevationData: (data: ElevationData | null) => void;
  setExaggeration: (value: number) => void;
  setBasePlateThicknessMM: (value: number) => void;
  setTargetDimensions: (widthMM: number, depthMM: number) => void;
}

type MapStore = MapState & MapActions;

export const useMapStore = create<MapStore>((set) => ({
  bbox: null,
  utmZone: null,
  dimensions: null,
  showPreview: false,
  generationStatus: 'idle',
  generationStep: '',
  elevationData: null,
  exaggeration: 1.5,
  basePlateThicknessMM: 3,
  targetWidthMM: 150,
  targetDepthMM: 150,

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

  setShowPreview: (show) => {
    set({ showPreview: show });
  },

  setGenerationStatus: (status, step = '') => {
    set({ generationStatus: status, generationStep: step });
  },

  setElevationData: (data) => {
    set({ elevationData: data });
  },

  setExaggeration: (value) => {
    set({ exaggeration: value });
  },

  setBasePlateThicknessMM: (value) => {
    set({ basePlateThicknessMM: value });
  },

  setTargetDimensions: (widthMM, depthMM) => {
    set({ targetWidthMM: widthMM, targetDepthMM: depthMM });
  },
}));
