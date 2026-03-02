import { create } from 'zustand';
import { BoundingBox, BboxDimensions, GenerationStatus, ElevationData, ExportResult, ExportStatus, BuildingGenerationStatus } from '../types/geo';
import { bboxDimensionsMeters, getUTMZone } from '../lib/utm';
import type { BuildingFeature } from '../lib/buildings/types';
import type { RoadFeature, RoadStyle } from '../lib/roads/types';
import type { WaterFeature } from '../lib/water/types';
import type { VegetationFeature } from '../lib/vegetation/types';
import { DeviceTier, getTier } from '../hooks/useBreakpoint';

export interface LayerToggles {
  buildings: boolean;
  roads: boolean;
  water: boolean;
  vegetation: boolean;
}

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
  // Phase 4: Layer toggles, units, Z height
  layerToggles: LayerToggles;
  units: 'mm' | 'in';
  targetHeightMM: number;
  // Road state
  roadFeatures: RoadFeature[] | null;
  roadStyle: RoadStyle;
  roadGenerationStatus: 'idle' | 'fetching' | 'building' | 'ready' | 'error';
  roadGenerationStep: string;
  // Layer rebuild status (shown as overlay during expensive rebuilds)
  rebuildingLayers: string | null;
  // Water state
  waterFeatures: WaterFeature[] | null;
  waterGenerationStatus: 'idle' | 'fetching' | 'ready' | 'error';
  waterGenerationStep: string;
  // Terrain smoothing level (0-100, default 25)
  smoothingLevel: number;
  // Vegetation state
  vegetationFeatures: VegetationFeature[] | null;
  vegetationGenerationStatus: 'idle' | 'fetching' | 'ready' | 'error';
  vegetationGenerationStep: string;
  // Stale bbox detection — key is set on successful generate
  generatedBboxKey: string | null;
  // Overture availability flag — true when Overture fetch succeeded (even if empty tiles)
  overtureAvailable: boolean;
  // Draw mode for mobile support
  drawMode: boolean;
  // Device tier for responsive layout
  deviceTier: DeviceTier;
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
  // Phase 4: Layer toggle, units, and dimension actions
  setLayerToggle: (layer: keyof LayerToggles, enabled: boolean) => void;
  setUnits: (units: 'mm' | 'in') => void;
  setTargetWidth: (widthMM: number) => void;
  setTargetHeightMM: (value: number) => void;
  // Road actions
  setRoadFeatures: (features: RoadFeature[] | null) => void;
  setRoadStyle: (style: RoadStyle) => void;
  setRoadGenerationStatus: (status: 'idle' | 'fetching' | 'building' | 'ready' | 'error', step?: string) => void;
  setRebuildingLayers: (status: string | null) => void;
  // Water actions
  setWaterFeatures: (features: WaterFeature[] | null) => void;
  setWaterGenerationStatus: (status: 'idle' | 'fetching' | 'ready' | 'error', step?: string) => void;
  setSmoothingLevel: (value: number) => void;
  // Vegetation actions
  setVegetationFeatures: (features: VegetationFeature[] | null) => void;
  setVegetationGenerationStatus: (status: 'idle' | 'fetching' | 'ready' | 'error', step?: string) => void;
  setGeneratedBboxKey: (key: string | null) => void;
  setOvertureAvailable: (available: boolean) => void;
  setDrawMode: (enabled: boolean) => void;
  setDeviceTier: (tier: DeviceTier) => void;
}

type MapStore = MapState & MapActions;

export const useMapStore = create<MapStore>((set, get) => ({
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
  // Phase 4: Layer toggles defaults (terrain has no toggle — always on)
  layerToggles: {
    buildings: true,
    roads: true,
    water: true,
    vegetation: true,
  },
  units: 'mm',
  targetHeightMM: 0,
  // Road state defaults
  roadFeatures: null,
  roadStyle: 'recessed',  // locked decision: default is recessed
  roadGenerationStatus: 'idle',
  roadGenerationStep: '',
  rebuildingLayers: null,
  // Water state defaults
  waterFeatures: null,
  waterGenerationStatus: 'idle',
  waterGenerationStep: '',
  // Terrain smoothing defaults
  smoothingLevel: 25,
  // Vegetation state defaults
  vegetationFeatures: null,
  vegetationGenerationStatus: 'idle',
  vegetationGenerationStep: '',
  // Stale bbox detection defaults
  generatedBboxKey: null,
  // Overture availability defaults
  overtureAvailable: false,
  // Draw mode defaults
  drawMode: false,
  // Device tier — initialized synchronously for correct first render
  deviceTier: getTier(),

  setBbox: (sw, ne) => {
    const bbox: BoundingBox = { sw, ne };
    const centroidLon = (sw.lon + ne.lon) / 2;
    const utmZone = getUTMZone(centroidLon);
    const dimensions = bboxDimensionsMeters(
      [sw.lon, sw.lat],
      [ne.lon, ne.lat]
    );
    set({ bbox, utmZone, dimensions, overtureAvailable: false });
  },

  clearBbox: () => {
    set({ bbox: null, utmZone: null, dimensions: null, overtureAvailable: false });
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

  setLayerToggle: (layer, enabled) => {
    set((state) => ({ layerToggles: { ...state.layerToggles, [layer]: enabled } }));
  },

  setUnits: (units) => {
    set({ units });
  },

  setTargetWidth: (widthMM) => {
    const state = get();
    if (!state.dimensions) {
      set({ targetWidthMM: widthMM });
      return;
    }
    const aspectRatio = state.dimensions.heightM / state.dimensions.widthM;
    set({ targetWidthMM: widthMM, targetDepthMM: widthMM * aspectRatio });
  },

  setTargetHeightMM: (value) => {
    set({ targetHeightMM: value });
  },

  setRoadFeatures: (features) => set({ roadFeatures: features }),
  setRoadStyle: (style) => set({ roadStyle: style }),
  setRoadGenerationStatus: (status, step = '') => set({ roadGenerationStatus: status, roadGenerationStep: step }),
  setRebuildingLayers: (status) => set({ rebuildingLayers: status }),
  setWaterFeatures: (features) => set({ waterFeatures: features }),
  setWaterGenerationStatus: (status, step = '') => set({ waterGenerationStatus: status, waterGenerationStep: step }),
  setSmoothingLevel: (value) => set({ smoothingLevel: value }),
  setVegetationFeatures: (features) => set({ vegetationFeatures: features }),
  setVegetationGenerationStatus: (status, step = '') => set({ vegetationGenerationStatus: status, vegetationGenerationStep: step }),
  setGeneratedBboxKey: (key) => set({ generatedBboxKey: key }),
  setOvertureAvailable: (available) => set({ overtureAvailable: available }),
  setDrawMode: (enabled) => set({ drawMode: enabled }),
  setDeviceTier: (tier) => set({ deviceTier: tier }),
}));
