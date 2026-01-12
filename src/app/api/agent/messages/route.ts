import { NextResponse } from 'next/server';
import { addMayorMessage, getMessagesSince } from '@/lib/agent/bridgeServer';
import {
  getAgentToken,
  isAgentEnabled,
  summarizeError,
  type MayorMessageType,
  type MayorMessagesResponse,
  type PostMessageResponse,
} from '@/lib/agent/types';

export const runtime = 'nodejs';

const VALID_MESSAGE_TYPES: MayorMessageType[] = ['thinking', 'action', 'status', 'greeting', 'response'];

function isValidMessageType(type: unknown): type is MayorMessageType {
  return typeof type === 'string' && VALID_MESSAGE_TYPES.includes(type as MayorMessageType);
}

export async function GET(request: Request) {
  if (!isAgentEnabled()) {
    return NextResponse.json<MayorMessagesResponse>({ ok: false, error: { code: 'DISABLED', message: 'Agent bridge disabled' } }, { status: 404 });
  }

  const url = new URL(request.url);
  const sinceId = url.searchParams.get('since') ?? undefined;

  const messages = getMessagesSince(sinceId);
  return NextResponse.json<MayorMessagesResponse>({ ok: true, messages });
}

export async function POST(request: Request) {
  if (!isAgentEnabled()) {
    return NextResponse.json<PostMessageResponse>({ ok: false, error: { code: 'DISABLED', message: 'Agent bridge disabled' } }, { status: 404 });
  }

  const token = getAgentToken();
  const provided = request.headers.get('x-agent-token');

  if (!token || provided !== token) {
    return NextResponse.json<PostMessageResponse>({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { type?: unknown; content?: unknown };

    if (!isValidMessageType(body.type)) {
      return NextResponse.json<PostMessageResponse>({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid message type' } }, { status: 400 });
    }

    if (typeof body.content !== 'string' || body.content.length === 0) {
      return NextResponse.json<PostMessageResponse>({ ok: false, error: { code: 'BAD_REQUEST', message: 'Content required' } }, { status: 400 });
    }

    const message = addMayorMessage({ type: body.type, content: body.content });
    return NextResponse.json<PostMessageResponse>({ ok: true, message });
  } catch (error) {
    return NextResponse.json<PostMessageResponse>({ ok: false, error: { code: 'ERROR', message: summarizeError(error) } }, { status: 500 });
  }
}
