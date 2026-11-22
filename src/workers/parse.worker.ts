/// <reference lib="webworker" />
// Parses briefs off the main thread so the UI stays smooth.
import { parseBrief } from '@/lib/parse';

export type ParseRequest = { id: number; fileName: string; buffer: ArrayBuffer };
export type ParseResponse =
  | { id: number; type: 'progress'; stage: 'reading' | 'detecting' }
  | { id: number; type: 'done'; brief: Awaited<ReturnType<typeof parseBrief>> }
  | { id: number; type: 'error'; name: string; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<ParseRequest>) => {
  const { id, fileName, buffer } = e.data;
  try {
    ctx.postMessage({ id, type: 'progress', stage: 'reading' } satisfies ParseResponse);
    const brief = await parseBrief(fileName, buffer);
    ctx.postMessage({ id, type: 'done', brief } satisfies ParseResponse);
  } catch (err) {
    const e2 = err as Error;
    ctx.postMessage({ id, type: 'error', name: e2.name, message: e2.message } satisfies ParseResponse);
  }
};
