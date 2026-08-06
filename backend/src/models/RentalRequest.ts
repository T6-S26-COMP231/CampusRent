import mongoose, { Schema } from 'mongoose';

export interface RentalRequestDoc {
  _id: number;
  listing_id: number;
  renter_id: number;
  start_date: string;
  end_date: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: Date;
  updated_at: Date;
}

const rentalRequestSchema = new Schema<RentalRequestDoc>(
  {
    _id: { type: Number, required: true },
    listing_id: { type: Number, required: true, index: true },
    renter_id: { type: Number, required: true, index: true },
    start_date: { type: String, required: true },
    end_date: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
      index: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const RentalRequest =
  mongoose.models.RentalRequest ||
  mongoose.model<RentalRequestDoc>('RentalRequest', rentalRequestSchema);

export function toRequestRow(request: RentalRequestDoc) {
  return {
    id: request._id,
    listing_id: request.listing_id,
    renter_id: request.renter_id,
    start_date: request.start_date,
    end_date: request.end_date,
    status: request.status,
    created_at: request.created_at.toISOString(),
    updated_at: request.updated_at.toISOString(),
  };
}
