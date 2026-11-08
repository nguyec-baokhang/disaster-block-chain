// Hides contact details people paste into the messages they check. Safe to import from client components.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w/])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w/])/g;

export function redact(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}
