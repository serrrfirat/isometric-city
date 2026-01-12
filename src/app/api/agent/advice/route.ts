import { NextResponse } from 'next/server';
import { addUserAdvice, getUnreadAdvice } from '@/lib/agent/bridgeServer';
import {
  getAgentToken,
  isAgentEnabled,
  summarizeError,
  type PostAdviceResponse,
  type UserAdviceResponse,
} from '@/lib/agent/types';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAgentEnabled()) {
    return NextResponse.json<UserAdviceResponse>({ ok: false, error: { code: 'DISABLED', message: 'Agent bridge disabled' } }, { status: 404 });
  }

  const token = getAgentToken();
  const provided = request.headers.get('x-agent-token');

  if (!token || provided !== token) {
    return NextResponse.json<UserAdviceResponse>({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }

  const advice = getUnreadAdvice();
  return NextResponse.json<UserAdviceResponse>({ ok: true, advice });
}

export async function POST(request: Request) {
  if (!isAgentEnabled()) {
    return NextResponse.json<PostAdviceResponse>({ ok: false, error: { code: 'DISABLED', message: 'Agent bridge disabled' } }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { content?: unknown };

    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json<PostAdviceResponse>({ ok: false, error: { code: 'BAD_REQUEST', message: 'Content required' } }, { status: 400 });
    }

    const advice = addUserAdvice(body.content.trim());
    return NextResponse.json<PostAdviceResponse>({ ok: true, advice });
  } catch (error) {
    return NextResponse.json<PostAdviceResponse>({ ok: false, error: { code: 'ERROR', message: summarizeError(error) } }, { status: 500 });
  }
}
