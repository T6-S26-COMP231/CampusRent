import fs from 'fs';
import path from 'path';
import type { HydratedDocument } from 'mongoose';
import { Listing, ListingDoc } from '../models/Listing';
import { RentalRequest } from '../models/RentalRequest';

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

/**
 * Shared hard-delete for owner removal (US-06) and admin moderation (US-23.4).
 * Deletes image files, related rental requests, then the Listing document.
 */
export async function removeListingDocument(
  listing: HydratedDocument<ListingDoc>
): Promise<void> {
  for (const image of listing.images) {
    const filePath = path.join(uploadsDir, image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await RentalRequest.deleteMany({ listing_id: listing._id });
  await listing.deleteOne();
}

export async function removeListingById(
  listingId: number
): Promise<HydratedDocument<ListingDoc> | null> {
  const listing = await Listing.findById(listingId);
  if (!listing) return null;
  await removeListingDocument(listing);
  return listing;
}
