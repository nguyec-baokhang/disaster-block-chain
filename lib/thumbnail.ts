// Client-only. Screenshots are never stored on the server, so the result page's thumbnail is a small
// downscaled copy kept in this browser tab's sessionStorage. Another device just shows a placeholder.
const key = (checkId: string) => `crisis-thumb:${checkId}`;
const MAX_SIDE = 480;

export async function saveThumbnail(checkId: string, file: File): Promise<void> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    sessionStorage.setItem(key(checkId), canvas.toDataURL("image/jpeg", 0.8));
  } catch {
    // No thumbnail is fine (private mode, full storage, unsupported image).
  }
}

export function loadThumbnail(checkId: string): string | null {
  try {
    const url = sessionStorage.getItem(key(checkId));
    return url?.startsWith("data:image/jpeg;base64,") ? url : null;
  } catch {
    return null;
  }
}
