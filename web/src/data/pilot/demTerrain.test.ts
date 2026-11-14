import { describe, expect, it } from 'vitest';
import { southPolarForward } from '../../geo/coordinates';
import { createDemHeightAt, sampleDemLayer, type DemLayerData } from './demTerrain';

describe('DEM terrain sampling and layer fallback', () => {
  it('bilinearly interpolates pixel centers and returns null on NaN or out-of-bounds', () => {
    // 2x2 grid with spacing 10 m, xMin=0, yMax=20 -> pixel centers at (5,15), (15,15), (5,5), (15,5)
    const layer: DemLayerData = {
      xMinM: 0,
      yMaxM: 20,
      spacingM: 10,
      rows: 2,
      cols: 2,
      data: new Float32Array([100, 200, 300, 400]),
    };

    expect(sampleDemLayer(layer, 5, 15)).toBeCloseTo(100, 6);
    expect(sampleDemLayer(layer, 15, 5)).toBeCloseTo(400, 6);
    expect(sampleDemLayer(layer, 10, 10)).toBeCloseTo(250, 6);
    expect(sampleDemLayer(layer, 4.9, 15)).toBeNull();
    expect(sampleDemLayer(layer, 15.1, 5)).toBeNull();

    const withNan: DemLayerData = { ...layer, data: new Float32Array([100, Number.NaN, 300, 400]) };
    expect(sampleDemLayer(withNan, 10, 10)).toBeNull();
  });

  it('prefers higher-priority local DEM layer over coarse background layer', () => {
    const target = { latDeg: -89.5, lonDegE: 180 };
    const { xM, yM } = southPolarForward(target.latDeg, target.lonDegE);

    const fine: DemLayerData = {
      xMinM: xM - 10,
      yMaxM: yM + 10,
      spacingM: 10,
      rows: 2,
      cols: 2,
      data: new Float32Array([1850, 1850, 1850, 1850]),
    };
    const coarse: DemLayerData = {
      xMinM: xM - 1000,
      yMaxM: yM + 1000,
      spacingM: 1000,
      rows: 2,
      cols: 2,
      data: new Float32Array([1500, 1500, 1500, 1500]),
    };

    const heightAt = createDemHeightAt([fine, coarse]);
    expect(heightAt(target.latDeg, target.lonDegE)).toBeCloseTo(1850, 4);
    // Away from fine patch, falls back to coarse regional layer
    expect(heightAt(-89.49, 180)).toBeCloseTo(1500, 4);
    // Outside north coverage returns null rather than fabricating zero
    expect(heightAt(-83.5, 180)).toBeNull();
  });
});
