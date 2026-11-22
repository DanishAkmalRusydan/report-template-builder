import type { ParsedBrief } from './types';
import type { ParseRequest, ParseResponse } from '@/workers/parse.worker';

export class ParseError extends Error {
  constructor(
    message: string,
    public code: 'no-text' | 'unsupported' | 'invalid' | 'unknown',
  ) {
    super(message);
  }
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    return null;
  }
}

function toParseError(name: string, message: string): ParseError {
  if (name === 'NoTextLayerError') return new ParseError(message, 'no-text');
  if (/Unsupported file type/.test(message)) return new ParseError(message, 'unsupported');
  if (/not a valid Word|Invalid PDF|end of central directory|zip/i.test(message))
    return new ParseError('This file could not be read. Check it opens in Word or a PDF viewer, then try again.', 'invalid');
  return new ParseError(`Something went wrong reading this brief: ${message}`, 'unknown');
}

/** Parse a brief in a Web Worker (falls back to the main thread if workers are unavailable). */
export async function parseFile(file: File, onStage?: (stage: 'reading' | 'detecting') => void): Promise<ParsedBrief> {
  const buffer = await file.arrayBuffer();
  const w = getWorker();
  if (!w) {
    const { parseBrief } = await import('./parse');
    try {
      return await parseBrief(file.name, buffer);
    } catch (e) {
      throw toParseError((e as Error).name, (e as Error).message);
    }
  }
  const id = nextId++;
  return new Promise<ParsedBrief>((resolve, reject) => {
    const onMessage = (e: MessageEvent<ParseResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        onStage?.(msg.stage);
        return;
      }
      w.removeEventListener('message', onMessage);
      if (msg.type === 'done') resolve(msg.brief);
      else reject(toParseError(msg.name, msg.message));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, fileName: file.name, buffer } satisfies ParseRequest, [buffer]);
  });
}
