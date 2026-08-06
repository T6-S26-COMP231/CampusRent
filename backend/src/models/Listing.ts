import mongoose, { Schema } from 'mongoose';

export interface ListingImageDoc {
  id: number;
  filename: string;
}

export interface ListingDoc {
  _id: number;
  owner_id: number;
  title: string;
  category: string;
  description: string;
  rental_terms: string;
  availability: 'available' | 'unavailable';
  images: ListingImageDoc[];
  created_at: Date;
  updated_at: Date;
}

const listingImageSchema = new Schema<ListingImageDoc>(
  {
    id: { type: Number, required: true },
    filename: { type: String, required: true },
  },
  { _id: false }
);

const listingSchema = new Schema<ListingDoc>(
  {
    _id: { type: Number, required: true },
    owner_id: { type: Number, required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    rental_terms: { type: String, default: '' },
    availability: {
      type: String,
      enum: ['available', 'unavailable'],
      default: 'available',
      index: true,
    },
    images: { type: [listingImageSchema], default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

listingSchema.index({ title: 'text', description: 'text' });

export const Listing =
  mongoose.models.Listing || mongoose.model<ListingDoc>('Listing', listingSchema);

export function toListingRow(listing: ListingDoc) {
  return {
    id: listing._id,
    owner_id: listing.owner_id,
    title: listing.title,
    category: listing.category,
    description: listing.description,
    rental_terms: listing.rental_terms,
    availability: listing.availability,
    created_at: listing.created_at.toISOString(),
    updated_at: listing.updated_at.toISOString(),
  };
}
