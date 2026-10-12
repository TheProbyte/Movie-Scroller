import type { Request, Response } from 'express';

/** Tiny server-sent-events hub so both phones refresh when anything changes. */
const clients = new Set<Response>();

export function subscribe(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function broadcast(type: string, data: Record<string, unknown> = {}) {
  const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  for (const c of clients) c.write(payload);
}
