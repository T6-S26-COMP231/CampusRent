export const MAX_LISTING_IMAGES = 5;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function validateListingImages(files: File[]): string | null {
  if (files.length > MAX_LISTING_IMAGES) {
    return `A listing can contain a maximum of ${MAX_LISTING_IMAGES} images.`;
  }

  const invalidType = files.find((file) => !ACCEPTED_IMAGE_TYPES.has(file.type));
  if (invalidType) {
    return `${invalidType.name} is not supported. Use JPG, PNG, or WEBP images only.`;
  }

  const oversized = files.find((file) => file.size > MAX_IMAGE_SIZE_BYTES);
  if (oversized) {
    return `${oversized.name} is larger than 5 MB.`;
  }

  return null;
}

/**
 * Resolve a file-picker selection for create/edit listing forms.
 * Rejects more than five total images (existing + newly selected) without
 * silently keeping only the first file.
 */
export function resolveListingImageSelection(
  files: FileList | File[] | null,
  options: { existingCount?: number } = {}
): { files: File[]; error: string | null } {
  const selected = files ? Array.from(files) : [];
  const existingCount = Math.max(0, options.existingCount ?? 0);

  const validationError = validateListingImages(selected);
  if (validationError) {
    return { files: [], error: validationError };
  }

  if (existingCount + selected.length > MAX_LISTING_IMAGES) {
    const remaining = Math.max(0, MAX_LISTING_IMAGES - existingCount);
    return {
      files: [],
      error: `You can add only ${remaining} more image(s). A listing cannot exceed ${MAX_LISTING_IMAGES} images.`,
    };
  }

  return { files: selected, error: null };
}

/** Append every selected file under the backend field name `images`. */
export function appendListingImages(formData: FormData, files: File[]): number {
  for (const file of files) {
    formData.append('images', file);
  }
  return files.length;
}

export function listingDetailImageEntries(
  images: Array<{ url: string }> | null | undefined
): Array<{ url: string; index: number }> {
  if (!images?.length) return [];
  return images.map((image, index) => ({ url: image.url, index }));
}

export function clampActiveImageIndex(activeIndex: number, imageCount: number): number {
  if (imageCount <= 0) return 0;
  if (!Number.isFinite(activeIndex) || activeIndex < 0) return 0;
  if (activeIndex >= imageCount) return imageCount - 1;
  return activeIndex;
}
