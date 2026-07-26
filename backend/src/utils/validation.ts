const INSTITUTIONAL_PATTERNS = [
  /@mycentennialcollege\.ca$/i,
  /@centennialcollege\.ca$/i,
  /@[a-z0-9.-]+\.edu$/i,
  /@[a-z0-9.-]+\.ac\.[a-z]{2}$/i,
];

export function isInstitutionalEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  return INSTITUTIONAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const LISTING_CATEGORIES = [
  'Textbooks',
  'Electronics',
  'Lab Equipment',
  'Sports & Recreation',
  'Tools',
  'Furniture',
  'Clothing',
  'Other',
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export function isValidCategory(category: string): category is ListingCategory {
  return (LISTING_CATEGORIES as readonly string[]).includes(category);
}

export function isValidAvailability(
  availability: string
): availability is 'available' | 'unavailable' {
  return availability === 'available' || availability === 'unavailable';
}
