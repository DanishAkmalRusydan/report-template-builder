import JSZip from 'jszip';

/**
 * Re-pack a zip WITHOUT directory entries (some cloud editors reject them), with
 * [Content_Types].xml first as Office expects.
 */
export async function repackZip(files: Map<string, Uint8Array | string>): Promise<Uint8Array> {
  const out = new JSZip();
  const names = [...files.keys()].sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0));
  for (const name of names) {
    if (name.endsWith('/')) continue;
    out.file(name, files.get(name)!, { createFolders: false, binary: typeof files.get(name) !== 'string' });
  }
  return out.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Load every file (not folder) of a zip into memory. Text parts are decoded as strings. */
export async function readZip(bytes: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array | string>> {
  const zip = await JSZip.loadAsync(bytes);
  const files = new Map<string, Uint8Array | string>();
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  await Promise.all(
    entries.map(async (f) => {
      const isText = /\.(xml|rels)$/i.test(f.name);
      files.set(f.name, isText ? await f.async('string') : await f.async('uint8array'));
    }),
  );
  return files;
}

export function getText(files: Map<string, Uint8Array | string>, name: string): string | undefined {
  const v = files.get(name);
  if (v === undefined) return undefined;
  return typeof v === 'string' ? v : new TextDecoder().decode(v);
}
