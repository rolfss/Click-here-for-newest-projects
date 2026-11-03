export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable=""], ' +
    '[contenteditable="true"], [contenteditable="plaintext-only"]');
}
