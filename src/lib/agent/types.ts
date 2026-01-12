import type { Budget, Stats, Tool } from '@/types/game';

export const AGENT_API_VERSION = 1 as const;

export type AgentPoint = { x: number; y: number };

export type AgentBudgetKey = keyof Budget;

export type AgentZoneTool =
  | 'zone_residential'
  | 'zone_commercial'
  | 'zone_industrial'
  | 'zone_dezone';

export type AgentAction =
  | { type: 'setSpeed'; speed: 0 | 1 | 2 | 3 }
  | { type: 'setTaxRate'; rate: number }
  | { type: 'setBudgetFunding'; key: AgentBudgetKey; funding: number }
  | { type: 'place'; tool: Tool; x: number; y: number }
  | { type: 'zoneRect'; tool: AgentZoneTool; x1: number; y1: number; x2: number; y2: number }
  | { type: 'buildTrackPath'; trackType: 'road' | 'rail'; path: AgentPoint[] }
  | { type: 'buildTrackBetween'; trackType: 'road' | 'rail'; from: AgentPoint; to: AgentPoint }
  | { type: 'advanceTicks'; count: number };

export type AgentActionRequest = {
  actions: AgentAction[];
  reason?: string;
};

export type AgentTileHotspot = AgentPoint & {
  value: number;
};

export type AgentObservation = {
  apiVersion: typeof AGENT_API_VERSION;
  at: number;
  city: {
    id: string;
    name: string;
  };
  time: {
    tick: number;
    year: number;
    month: number;
    day: number;
    hour: number;
  };
  controls: {
    speed: 0 | 1 | 2 | 3;
    taxRate: number;
    budget: Budget;
  };
  stats: Stats;
  grid: {
    size: number;
    zoneCounts: {
      residential: number;
      commercial: number;
      industrial: number;
      none: number;
    };
    buildingCounts: {
      road: number;
      rail: number;
      power_plant: number;
      water_tower: number;
      police_station: number;
      fire_station: number;
      hospital: number;
      school: number;
      university: number;
    };
  };
  services: {
    coveragePct: {
      police: number;
      fire: number;
      health: number;
      education: number;
      power: number;
      water: number;
    };
  };
  hotspots: {
    traffic: AgentTileHotspot[];
    pollution: AgentTileHotspot[];
    crime: AgentTileHotspot[];
  };
  spatial?: {
    developedTiles: number;
    serviceDeficits: {
      police: AgentTileHotspot[];
      fire: AgentTileHotspot[];
      health: AgentTileHotspot[];
      education: AgentTileHotspot[];
      power: AgentTileHotspot[];
      water: AgentTileHotspot[];
      roadAccess: AgentTileHotspot[];
    };
    windows: Array<{
      label: string;
      center: { x: number; y: number };
      radius: number;
      rows: string[];
    }>;
  };
};

export type AgentActionResult = {
  ok: boolean;
  error?: { code: string; message: string };
};

export type AgentObserveResponse = {
  ok: boolean;
  observation?: AgentObservation;
  error?: { code: string; message: string };
};

export type AgentEnqueueResponse = {
  ok: boolean;
  queued?: number;
  error?: { code: string; message: string };
};

export type AgentNextActionsResponse = {
  ok: boolean;
  actions?: AgentActionRequest;
  error?: { code: string; message: string };
};

export type MayorMessageType = 'thinking' | 'action' | 'status' | 'greeting' | 'response';

export type MayorMessage = {
  id: string;
  at: number;
  type: MayorMessageType;
  content: string;
};

// Streaming types for real-time token output
export type StreamChunk = {
  id: string;
  streamId: string;
  content: string;
  at: number;
  done: boolean;
};

export type StreamEvent = 
  | { type: 'chunk'; data: StreamChunk }
  | { type: 'start'; data: { streamId: string; at: number } }
  | { type: 'end'; data: { streamId: string; at: number } };

export type PostStreamChunkRequest = {
  streamId?: string; // If not provided, starts a new stream
  content: string;
  done?: boolean;
};

export type PostStreamChunkResponse = {
  ok: boolean;
  streamId?: string;
  chunkId?: string;
  error?: { code: string; message: string };
};

export type UserAdvice = {
  id: string;
  at: number;
  content: string;
  read: boolean;
};

export type MayorMessagesResponse = {
  ok: boolean;
  messages?: MayorMessage[];
  error?: { code: string; message: string };
};

export type PostMessageResponse = {
  ok: boolean;
  message?: MayorMessage;
  error?: { code: string; message: string };
};

export type UserAdviceResponse = {
  ok: boolean;
  advice?: UserAdvice[];
  error?: { code: string; message: string };
};

export type PostAdviceResponse = {
  ok: boolean;
  advice?: UserAdvice;
  error?: { code: string; message: string };
};

export function getAgentToken(): string | undefined {
  return process.env.AGENT_BRIDGE_TOKEN ?? process.env.NEXT_PUBLIC_AGENT_BRIDGE_TOKEN;
}

export function isAgentEnabled(): boolean {
  return Boolean(getAgentToken());
}

export function assertAgentEnabled(): void {
  if (!isAgentEnabled()) {
    throw new Error('Agent bridge is disabled');
  }
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

