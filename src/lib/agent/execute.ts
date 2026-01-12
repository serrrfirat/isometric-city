import {
  createBridgesOnPath,
  placeBuilding,
  placeLandTerraform,
  placeSubway,
  placeWaterTerraform,
  simulateTick,
  bulldozeTile,
} from '@/lib/simulation';
import type { BuildingType, GameState, Tool, ZoneType } from '@/types/game';
import { TOOL_INFO } from '@/types/game';
import type { AgentAction, AgentActionRequest, AgentPoint } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toolToZone(tool: Tool): ZoneType | null {
  switch (tool) {
    case 'zone_residential':
      return 'residential';
    case 'zone_commercial':
      return 'commercial';
    case 'zone_industrial':
      return 'industrial';
    case 'zone_dezone':
      return 'none';
    default:
      return null;
  }
}

function toolToBuilding(tool: Tool): BuildingType | null {
  switch (tool) {
    case 'road':
    case 'rail':
    case 'police_station':
    case 'fire_station':
    case 'hospital':
    case 'school':
    case 'university':
    case 'power_plant':
    case 'water_tower':
    case 'subway_station':
      return tool;
    default:
      return null;
  }
}

function tryPlaceTool(state: GameState, tool: Tool, x: number, y: number): GameState {
  const info = TOOL_INFO[tool];
  const cost = info?.cost ?? 0;
  const tile = state.grid[y]?.[x];

  if (!tile) return state;
  if (cost > 0 && state.stats.money < cost) return state;

  if (tool === 'bulldoze' && tile.building.type === 'grass' && tile.zone === 'none') {
    return state;
  }

  if (tool === 'subway') {
    if (tile.building.type === 'water') return state;
    if (tile.hasSubway) return state;

    const nextState = placeSubway(state, x, y);
    if (nextState === state) return state;

    return {
      ...nextState,
      stats: { ...nextState.stats, money: nextState.stats.money - cost },
    };
  }

  if (tool === 'zone_water') {
    if (tile.building.type === 'water') return state;
    if (tile.building.type === 'bridge') return state;

    const nextState = placeWaterTerraform(state, x, y);
    if (nextState === state) return state;

    return {
      ...nextState,
      stats: { ...nextState.stats, money: nextState.stats.money - cost },
    };
  }

  if (tool === 'zone_land') {
    if (tile.building.type !== 'water') return state;

    const nextState = placeLandTerraform(state, x, y);
    if (nextState === state) return state;

    return {
      ...nextState,
      stats: { ...nextState.stats, money: nextState.stats.money - cost },
    };
  }

  let nextState: GameState;

  if (tool === 'bulldoze') {
    nextState = bulldozeTile(state, x, y);
  } else {
    const zone = toolToZone(tool);
    const building = toolToBuilding(tool);

    if (zone) {
      if (tile.zone === zone) return state;
      nextState = placeBuilding(state, x, y, null, zone);
    } else if (building) {
      if (tile.building.type === building) return state;
      nextState = placeBuilding(state, x, y, building, null);
    } else {
      return state;
    }
  }

  if (nextState === state) return state;

  if (cost > 0) {
    return {
      ...nextState,
      stats: { ...nextState.stats, money: nextState.stats.money - cost },
    };
  }

  return nextState;
}

function manhattanPath(from: AgentPoint, to: AgentPoint): AgentPoint[] {
  const path: AgentPoint[] = [];

  let x = from.x;
  let y = from.y;

  path.push({ x, y });

  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    path.push({ x, y });
  }

  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    path.push({ x, y });
  }

  return path;
}

function isPassableForTrack(tileType: BuildingType, trackType: 'road' | 'rail'): boolean {
  if (tileType === 'water') return false;
  if (tileType === 'bridge') return true;

  if (trackType === 'road') {
    return tileType === 'grass' || tileType === 'tree' || tileType === 'road' || tileType === 'rail';
  }

  return tileType === 'grass' || tileType === 'tree' || tileType === 'rail' || tileType === 'road';
}

function findTrackPath(state: GameState, from: AgentPoint, to: AgentPoint, trackType: 'road' | 'rail'): AgentPoint[] {
  const size = state.gridSize;

  const start = state.grid[from.y]?.[from.x];
  const goal = state.grid[to.y]?.[to.x];
  if (!start || !goal) return manhattanPath(from, to);
  if (!isPassableForTrack(start.building.type, trackType)) return manhattanPath(from, to);
  if (!isPassableForTrack(goal.building.type, trackType)) return manhattanPath(from, to);

  const startIdx = from.y * size + from.x;
  const goalIdx = to.y * size + to.x;

  const prev = new Int32Array(size * size);
  prev.fill(-1);
  prev[startIdx] = startIdx;

  const qx = new Int16Array(size * size);
  const qy = new Int16Array(size * size);
  let head = 0;
  let tail = 0;

  qx[tail] = from.x;
  qy[tail] = from.y;
  tail++;

  while (head < tail) {
    const cx = qx[head];
    const cy = qy[head];
    head++;

    const cIdx = cy * size + cx;
    if (cIdx === goalIdx) break;

    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const nIdx = ny * size + nx;
      if (prev[nIdx] !== -1) continue;

      const tile = state.grid[ny]?.[nx];
      if (!tile) continue;
      if (!isPassableForTrack(tile.building.type, trackType)) continue;

      prev[nIdx] = cIdx;
      qx[tail] = nx;
      qy[tail] = ny;
      tail++;

      if (nIdx === goalIdx) {
        head = tail;
        break;
      }
    }
  }

  if (prev[goalIdx] === -1) return manhattanPath(from, to);

  const path: AgentPoint[] = [];
  let cursor = goalIdx;
  while (cursor !== startIdx) {
    const x = cursor % size;
    const y = Math.floor(cursor / size);
    path.push({ x, y });
    cursor = prev[cursor];
    if (cursor === -1) return manhattanPath(from, to);
  }
  path.push({ x: from.x, y: from.y });
  path.reverse();

  return path;
}

function applyAction(state: GameState, action: AgentAction): GameState {
  switch (action.type) {
    case 'setSpeed':
      return { ...state, speed: action.speed };

    case 'setTaxRate':
      return { ...state, taxRate: clamp(action.rate, 0, 100) };

    case 'setBudgetFunding': {
      const clamped = clamp(action.funding, 0, 100);
      const existing = state.budget[action.key];
      return {
        ...state,
        budget: {
          ...state.budget,
          [action.key]: { ...existing, funding: clamped },
        },
      };
    }

    case 'place':
      return tryPlaceTool(state, action.tool, action.x, action.y);

    case 'zoneRect': {
      const x1 = Math.min(action.x1, action.x2);
      const x2 = Math.max(action.x1, action.x2);
      const y1 = Math.min(action.y1, action.y2);
      const y2 = Math.max(action.y1, action.y2);

      let next = state;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          next = tryPlaceTool(next, action.tool, x, y);
        }
      }

      return next;
    }

    case 'buildTrackPath': {
      const tool: Tool = action.trackType;
      let next = state;
      const fullPath: AgentPoint[] = [];

      for (let i = 0; i < action.path.length - 1; i++) {
        const from = action.path[i];
        const to = action.path[i + 1];
        const segment = findTrackPath(next, from, to, action.trackType);

        for (const p of segment) {
          next = tryPlaceTool(next, tool, p.x, p.y);
        }

        if (i === 0) {
          fullPath.push(...segment);
        } else {
          fullPath.push(...segment.slice(1));
        }
      }

      return createBridgesOnPath(next, fullPath, action.trackType);
    }

    case 'buildTrackBetween': {
      const path = findTrackPath(state, action.from, action.to, action.trackType);
      const tool: Tool = action.trackType;
      let next = state;
      for (const p of path) {
        next = tryPlaceTool(next, tool, p.x, p.y);
      }

      return createBridgesOnPath(next, path, action.trackType);
    }

    case 'advanceTicks': {
      const count = clamp(action.count, 0, 500);
      let next = state;
      for (let i = 0; i < count; i++) {
        next = simulateTick(next);
      }
      return next;
    }

  }
}

export function applyAgentActionRequest(state: GameState, request: AgentActionRequest): GameState {
  let next = state;

  const speedBefore = next.speed;
  let didSetSpeed = false;

  next = { ...next, speed: 0 };

  for (const action of request.actions) {
    if (action.type === 'setSpeed') {
      didSetSpeed = true;
    }
    next = applyAction(next, action);
  }

  if (!didSetSpeed) {
    next = { ...next, speed: speedBefore };
  }

  return next;
}
