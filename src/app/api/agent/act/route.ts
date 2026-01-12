import { NextResponse } from 'next/server';
import { enqueueActionRequest } from '@/lib/agent/bridgeServer';
import {
  getAgentToken,
  isAgentEnabled,
  summarizeError,
  type AgentActionRequest,
  type AgentEnqueueResponse,
} from '@/lib/agent/types';

export const runtime = 'nodejs';

function requireToken(request: Request): NextResponse<AgentEnqueueResponse> | null {
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

function isActionRequest(value: unknown): value is AgentActionRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as { actions?: unknown };
  return Array.isArray(v.actions);
}

export async function POST(request: Request) {
  const denied = requireToken(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as unknown;
    if (!isActionRequest(body)) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Expected { actions: [] }' } }, { status: 400 });
    }

    const queued = enqueueActionRequest(body);
    return NextResponse.json({ ok: true, queued });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'ERROR', message: summarizeError(error) } }, { status: 500 });
  }
}
