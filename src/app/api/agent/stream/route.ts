import { NextRequest, NextResponse } from 'next/server';
import { getAgentToken, type PostStreamChunkResponse } from '@/lib/agent/types';
import {
  registerStreamClient,
  unregisterStreamClient,
  pushStreamChunk,
  getConnectedClientCount,
} from '@/lib/agent/bridgeServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function verifyToken(request: NextRequest): boolean {
  const expectedToken = getAgentToken();
  if (!expectedToken) return true;
  
  const providedToken = request.headers.get('x-agent-token');
  return providedToken === expectedToken;
}

export async function GET(): Promise<Response> {
  let clientId: string | null = null;
  
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientId = registerStreamClient(controller);
      
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected as ${clientId}\n\n`));
    },
    cancel() {
      if (clientId) {
        unregisterStreamClient(clientId);
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse<PostStreamChunkResponse>> {
  if (!verifyToken(request)) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 }
    );
  }
  
  try {
    const body = await request.json();
    const { streamId, content, done = false } = body as { streamId?: string; content: string; done?: boolean };
    
    if (typeof content !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'INVALID_REQUEST', message: 'content must be a string' } },
        { status: 400 }
      );
    }
    
    const clients = getConnectedClientCount();
    if (clients === 0) {
      return NextResponse.json({
        ok: true,
        streamId: streamId || 'no_clients',
        chunkId: 'dropped',
      });
    }
    
    const result = pushStreamChunk(content, done, streamId);
    
    return NextResponse.json({
      ok: true,
      streamId: result.streamId,
      chunkId: result.chunkId,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: String(err) } },
      { status: 500 }
    );
  }
}
