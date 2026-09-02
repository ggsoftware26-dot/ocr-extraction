export const OCR_PROVIDER_IDS = ['gemini', 'qwen'] as const;

export type OcrProviderId = (typeof OCR_PROVIDER_IDS)[number];

export function isOcrProviderId(value: unknown): value is OcrProviderId {
  return (
    typeof value === 'string' &&
    (OCR_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

export function parseOcrProviderId(
  value: unknown,
  fallback: OcrProviderId = 'gemini',
): OcrProviderId {
  return isOcrProviderId(value) ? value : fallback;
}
