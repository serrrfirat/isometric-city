import { NextResponse } from 'next/server';
import { dequeueNextActionRequest } from '@/lib/agent/bridgeServer';
import { getAgentToken, isAgentEnabled, type AgentNextActionsResponse } from '@/lib/agent/types';

export const runtime = 'nodejs';

function requireToken(request: Request): NextResponse<AgentNextActionsResponse> | null {
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

  const next = dequeueNextActionRequest();
  if (!next) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, actions: next });
}
