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
