import { create } from 'zustand';
import { BoundingBox, BboxDimensions, GenerationStatus, ElevationData, ExportResult, ExportStatus, BuildingGenerationStatus } from '../types/geo';
import { bboxDimensionsMeters, getUTMZone } from '../lib/utm';
import type { BuildingFeature } from '../lib/buildings/types';

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
  // Export state
  exportStatus: ExportStatus;
  exportStep: string;
  exportResult: ExportResult | null;
  locationName: string | null;
  // Building state
  buildingFeatures: BuildingFeature[] | null;
  buildingGenerationStatus: BuildingGenerationStatus;
  buildingGenerationStep: string;
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
  // Export actions
  setExportStatus: (status: ExportStatus, step?: string) => void;
  setExportResult: (result: ExportResult | null) => void;
  setLocationName: (name: string | null) => void;
  // Building actions
  setBuildingFeatures: (features: BuildingFeature[] | null) => void;
  setBuildingGenerationStatus: (status: BuildingGenerationStatus, step?: string) => void;
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
  // Export state defaults
  exportStatus: 'idle',
  exportStep: '',
  exportResult: null,
  locationName: null,
  // Building state defaults
  buildingFeatures: null,
  buildingGenerationStatus: 'idle',
  buildingGenerationStep: '',

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

  setExportStatus: (status, step = '') => {
    set({ exportStatus: status, exportStep: step });
  },

  setExportResult: (result) => {
    set({ exportResult: result });
  },

  setLocationName: (name) => {
    set({ locationName: name });
  },

  setBuildingFeatures: (features) => {
    set({ buildingFeatures: features });
  },

  setBuildingGenerationStatus: (status, step = '') => {
    set({ buildingGenerationStatus: status, buildingGenerationStep: step });
  },
}));
