import type { GameState, Tile } from '@/types/game';
import { AGENT_API_VERSION, type AgentObservation, type AgentTileHotspot } from './types';

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function pct(covered: number, total: number): number {
  if (total <= 0) return 0;
  return clampPct((covered / total) * 100);
}

function topHotspots(tiles: Array<{ x: number; y: number; value: number }>, limit: number): AgentTileHotspot[] {
  const sorted = tiles
    .filter((t) => Number.isFinite(t.value) && t.value > 0)
    .sort((a, b) => b.value - a.value);

  return sorted.slice(0, limit);
}

function isDevelopedTile(tile: Tile): boolean {
  return tile.zone !== 'none' || tile.building.population > 0 || tile.building.jobs > 0;
}

function clampCoord(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function renderWindow(state: GameState, centerX: number, centerY: number, radius: number): string[] {
  const size = state.gridSize;
  const rows: string[] = [];

  const minY = clampCoord(centerY - radius, 0, size - 1);
  const maxY = clampCoord(centerY + radius, 0, size - 1);
  const minX = clampCoord(centerX - radius, 0, size - 1);
  const maxX = clampCoord(centerX + radius, 0, size - 1);

  for (let y = minY; y <= maxY; y++) {
    let row = '';
    for (let x = minX; x <= maxX; x++) {
      const tile = state.grid[y]?.[x];
      if (!tile) {
        row += ' ';
        continue;
      }

      const b = tile.building.type;
      if (b === 'water') row += '~';
      else if (b === 'bridge') row += '#';
      else if (b === 'road') row += '=';
      else if (b === 'rail') row += '-';
      else if (b === 'power_plant') row += 'P';
      else if (b === 'water_tower') row += 'W';
      else if (b === 'police_station') row += 'p';
      else if (b === 'fire_station') row += 'f';
      else if (b === 'hospital') row += 'h';
      else if (b === 'school') row += 's';
      else if (b === 'university') row += 'u';
      else if (b === 'tree') row += 't';
      else if (tile.zone === 'residential') row += 'R';
      else if (tile.zone === 'commercial') row += 'C';
      else if (tile.zone === 'industrial') row += 'I';
      else row += '.';
    }
    rows.push(row);
  }

  return rows;
}

function hasRoadAccessWithinZone(state: GameState, startX: number, startY: number, maxDistance = 8): boolean {
  const size = state.gridSize;
  const startTile = state.grid[startY]?.[startX];
  if (!startTile) return false;
  const startZone = startTile.zone;
  if (startZone === 'none') return true;

  const visited = new Uint8Array(size * size);
  const qx: number[] = [startX];
  const qy: number[] = [startY];
  const qd: number[] = [0];
  visited[startY * size + startX] = 1;

  while (qx.length > 0) {
    const cx = qx.shift() as number;
    const cy = qy.shift() as number;
    const dist = qd.shift() as number;

    if (dist >= maxDistance) continue;

    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const idx = ny * size + nx;
      if (visited[idx]) continue;
      visited[idx] = 1;

      const tile = state.grid[ny]?.[nx];
      if (!tile) continue;

      if (tile.building.type === 'road' || tile.building.type === 'bridge') {
        return true;
      }

      if (tile.zone === startZone && tile.building.type !== 'water') {
        qx.push(nx);
        qy.push(ny);
        qd.push(dist + 1);
      }
    }
  }

  return false;
}

export function buildAgentObservation(state: GameState): AgentObservation {
  const size = state.gridSize;

  let zoneResidential = 0;
  let zoneCommercial = 0;
  let zoneIndustrial = 0;
  let zoneNone = 0;

  const buildingCounts: AgentObservation['grid']['buildingCounts'] = {
    road: 0,
    rail: 0,
    power_plant: 0,
    water_tower: 0,
    police_station: 0,
    fire_station: 0,
    hospital: 0,
    school: 0,
    university: 0,
  };

  const traffic: Array<{ x: number; y: number; value: number }> = [];
  const pollution: Array<{ x: number; y: number; value: number }> = [];
  const crime: Array<{ x: number; y: number; value: number }> = [];

  let policeCovered = 0;
  let fireCovered = 0;
  let healthCovered = 0;
  let educationCovered = 0;
  let powerCovered = 0;
  let waterCovered = 0;

  const totalTiles = size * size;

  let developedTiles = 0;

  const policeDeficits: Array<{ x: number; y: number; value: number }> = [];
  const fireDeficits: Array<{ x: number; y: number; value: number }> = [];
  const healthDeficits: Array<{ x: number; y: number; value: number }> = [];
  const educationDeficits: Array<{ x: number; y: number; value: number }> = [];
  const powerDeficits: Array<{ x: number; y: number; value: number }> = [];
  const waterDeficits: Array<{ x: number; y: number; value: number }> = [];
  const roadAccessDeficits: Array<{ x: number; y: number; value: number }> = [];

  for (let y = 0; y < size; y++) {
    const row = state.grid[y];
    if (!row) continue;

    const policeRow = state.services.police[y];
    const fireRow = state.services.fire[y];
    const healthRow = state.services.health[y];
    const educationRow = state.services.education[y];
    const powerRow = state.services.power[y];
    const waterRow = state.services.water[y];

    for (let x = 0; x < size; x++) {
      const tile: Tile | undefined = row[x];
      if (!tile) continue;

      switch (tile.zone) {
        case 'residential':
          zoneResidential++;
          break;
        case 'commercial':
          zoneCommercial++;
          break;
        case 'industrial':
          zoneIndustrial++;
          break;
        default:
          zoneNone++;
          break;
      }

      const buildingType = tile.building.type;
      if (buildingType in buildingCounts) {
        buildingCounts[buildingType as keyof typeof buildingCounts]++;
      }

      if (tile.traffic > 0) traffic.push({ x, y, value: tile.traffic });
      if (tile.pollution > 0) pollution.push({ x, y, value: tile.pollution });
      if (tile.crime > 0) crime.push({ x, y, value: tile.crime });

      if (policeRow?.[x] && policeRow[x] > 0) policeCovered++;
      if (fireRow?.[x] && fireRow[x] > 0) fireCovered++;
      if (healthRow?.[x] && healthRow[x] > 0) healthCovered++;
      if (educationRow?.[x] && educationRow[x] > 0) educationCovered++;
      if (powerRow?.[x]) powerCovered++;
      if (waterRow?.[x]) waterCovered++;

      if (isDevelopedTile(tile)) {
        developedTiles++;
        const weight = 1 + tile.building.population + tile.building.jobs;

        const policeVal = policeRow?.[x] ?? 0;
        const fireVal = fireRow?.[x] ?? 0;
        const healthVal = healthRow?.[x] ?? 0;
        const educationVal = educationRow?.[x] ?? 0;

        policeDeficits.push({ x, y, value: Math.max(0, 100 - policeVal) * weight });
        fireDeficits.push({ x, y, value: Math.max(0, 100 - fireVal) * weight });
        healthDeficits.push({ x, y, value: Math.max(0, 100 - healthVal) * weight });
        educationDeficits.push({ x, y, value: Math.max(0, 100 - educationVal) * weight });

        if (!powerRow?.[x]) {
          powerDeficits.push({ x, y, value: weight * 100 });
        }

        if (!waterRow?.[x]) {
          waterDeficits.push({ x, y, value: weight * 100 });
        }

        if (tile.zone !== 'none' && weight > 1) {
          const left = state.grid[y]?.[x - 1];
          const right = state.grid[y]?.[x + 1];
          const up = state.grid[y - 1]?.[x];
          const down = state.grid[y + 1]?.[x];
          const hasAdjacentRoad =
            left?.building.type === 'road' ||
            left?.building.type === 'bridge' ||
            right?.building.type === 'road' ||
            right?.building.type === 'bridge' ||
            up?.building.type === 'road' ||
            up?.building.type === 'bridge' ||
            down?.building.type === 'road' ||
            down?.building.type === 'bridge';

          if (!hasAdjacentRoad && !hasRoadAccessWithinZone(state, x, y)) {
            roadAccessDeficits.push({ x, y, value: weight });
          }
        }
      }
    }
  }

  const trafficHotspots = topHotspots(traffic, 10);
  const pollutionHotspots = topHotspots(pollution, 10);
  const crimeHotspots = topHotspots(crime, 10);

  const policeDeficitHotspots = topHotspots(policeDeficits, 10);
  const fireDeficitHotspots = topHotspots(fireDeficits, 10);
  const healthDeficitHotspots = topHotspots(healthDeficits, 10);
  const educationDeficitHotspots = topHotspots(educationDeficits, 10);
  const powerDeficitHotspots = topHotspots(powerDeficits, 10);
  const waterDeficitHotspots = topHotspots(waterDeficits, 10);
  const roadAccessDeficitHotspots = topHotspots(roadAccessDeficits, 10);

  const windows: Array<{ label: string; center: { x: number; y: number }; radius: number; rows: string[] }> = [];
  const radius = 6;
  const candidates: Array<{ label: string; x: number; y: number }> = [];

  if (crimeHotspots[0]) candidates.push({ label: 'crime_hotspot', x: crimeHotspots[0].x, y: crimeHotspots[0].y });
  if (pollutionHotspots[0]) candidates.push({ label: 'pollution_hotspot', x: pollutionHotspots[0].x, y: pollutionHotspots[0].y });
  if (roadAccessDeficitHotspots[0]) candidates.push({ label: 'road_access_gap', x: roadAccessDeficitHotspots[0].x, y: roadAccessDeficitHotspots[0].y });

  for (const c of candidates.slice(0, 3)) {
    windows.push({
      label: c.label,
      center: { x: c.x, y: c.y },
      radius,
      rows: renderWindow(state, c.x, c.y, radius),
    });
  }

  return {
    apiVersion: AGENT_API_VERSION,
    at: Date.now(),
    city: {
      id: state.id,
      name: state.cityName,
    },
    time: {
      tick: state.tick,
      year: state.year,
      month: state.month,
      day: state.day,
      hour: state.hour,
    },
    controls: {
      speed: state.speed,
      taxRate: state.taxRate,
      budget: state.budget,
    },
    stats: state.stats,
    grid: {
      size,
      zoneCounts: {
        residential: zoneResidential,
        commercial: zoneCommercial,
        industrial: zoneIndustrial,
        none: zoneNone,
      },
      buildingCounts,
    },
    services: {
      coveragePct: {
        police: pct(policeCovered, totalTiles),
        fire: pct(fireCovered, totalTiles),
        health: pct(healthCovered, totalTiles),
        education: pct(educationCovered, totalTiles),
        power: pct(powerCovered, totalTiles),
        water: pct(waterCovered, totalTiles),
      },
    },
    hotspots: {
      traffic: trafficHotspots,
      pollution: pollutionHotspots,
      crime: crimeHotspots,
    },
    spatial: {
      developedTiles,
      serviceDeficits: {
        police: policeDeficitHotspots,
        fire: fireDeficitHotspots,
        health: healthDeficitHotspots,
        education: educationDeficitHotspots,
        power: powerDeficitHotspots,
        water: waterDeficitHotspots,
        roadAccess: roadAccessDeficitHotspots,
      },
      windows,
    },
  };
}
