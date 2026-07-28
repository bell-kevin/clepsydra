// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Share links.
 *
 * The whole analysis is packed into the URL fragment, which never leaves the
 * browser: fragments are not sent to servers, so a link can be pasted into an
 * email without the drawdown record travelling through anyone's logs on the
 * way. Raw deflate via the native CompressionStream keeps a 70-point two-well
 * test comfortably inside normal URL limits.
 *
 * Payloads are prefixed so an older link stays readable if the format changes:
 *   "1z" deflate-raw, base64url
 *   "1p" plain JSON, base64url, used where CompressionStream is missing
 */

const DEFLATE = '1z';
const PLAIN = '1p';

export async function encodeState(state: unknown): Promise<string> {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') {
    return PLAIN + toBase64Url(bytes);
  }
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    return DEFLATE + toBase64Url(packed);
  } catch {
    return PLAIN + toBase64Url(bytes);
  }
}

export async function decodeState<T>(payload: string): Promise<T | null> {
  if (!payload || payload.length < 3) return null;
  const tag = payload.slice(0, 2);
  const body = payload.slice(2);
  try {
    const bytes = fromBase64Url(body);
    if (tag === PLAIN) {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    }
    if (tag === DEFLATE) {
      if (typeof DecompressionStream === 'undefined') return null;
      const stream = new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      const json = await new Response(stream).text();
      return JSON.parse(json) as T;
    }
    return null;
  } catch {
    return null;
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
