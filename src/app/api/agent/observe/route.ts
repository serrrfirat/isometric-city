import { NextResponse } from 'next/server';
import { getLatestObservation, setLatestObservation } from '@/lib/agent/bridgeServer';
import {
  AGENT_API_VERSION,
  getAgentToken,
  isAgentEnabled,
  summarizeError,
  type AgentObservation,
  type AgentObserveResponse,
} from '@/lib/agent/types';

export const runtime = 'nodejs';

function requireToken(request: Request): NextResponse<AgentObserveResponse> | null {
  if (!isAgentEnabled()) {
    return NextResponse.json({ ok: false, error: { code: 'DISABLED', message: 'Agent bridge disabled' } }, { status: 404 });
  }

  const token = getAgentToken();
  const provided = request.headers.get('x-agent-token');

  if (!token || provided !== token) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }

  return null;
}

export async function GET(request: Request) {
  const denied = requireToken(request);
  if (denied) return denied;

  const { observation } = getLatestObservation();
  if (!observation) {
    return NextResponse.json({ ok: false, error: { code: 'NO_OBSERVATION', message: 'No observation published yet' } }, { status: 404 });
  }

  return NextResponse.json({ ok: true, observation });
}

function isAgentObservation(value: unknown): value is AgentObservation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AgentObservation>;
  return (
    v.apiVersion === AGENT_API_VERSION &&
    typeof v.at === 'number' &&
    typeof v.city?.id === 'string' &&
    typeof v.city?.name === 'string' &&
    typeof v.time?.tick === 'number' &&
    typeof v.grid?.size === 'number'
  );
}

export async function POST(request: Request) {
  const denied = requireToken(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Expected JSON body' } }, { status: 400 });
    }

    const observation = (body as { observation?: unknown }).observation;
    if (!isAgentObservation(observation)) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Expected { observation }' } }, { status: 400 });
    }

    setLatestObservation(observation);

    return NextResponse.json({ ok: true, observation });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'ERROR', message: summarizeError(error) } }, { status: 500 });
  }
}
