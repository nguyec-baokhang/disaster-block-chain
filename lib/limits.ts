// Input length limits shared by forms and API routes (safe to import from client components).
export const MAX_CHECK_TEXT_CHARS = 5_000;
export const MAX_TITLE_CHARS = 200;
export const MAX_BODY_CHARS = 5_000;

export const MAX_URL_CHARS = 2_000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// Shared by the /check form and POST /api/check. Returns an error message, or null when OK.
export function imageError(type: string, size: number): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) return "Screenshot must be a PNG, JPG or WEBP image.";
  if (size <= 0) return "That image is empty.";
  if (size > MAX_IMAGE_BYTES) return "That image is too large. Please use one under 10 MB.";
  return null;
}
