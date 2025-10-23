function toUint8Array(input: string | ArrayBuffer): Uint8Array {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  const encoder = new TextEncoder();
  return encoder.encode(input);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const view = toUint8Array(input);
  if (!window.crypto?.subtle) {
    throw new Error('crypto.subtle is not available in this environment');
  }
  const digest = await window.crypto.subtle.digest('SHA-256', view);
  return bufferToHex(digest);
}

