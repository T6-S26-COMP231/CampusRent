import mongoose, { Schema } from 'mongoose';

interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter =
  mongoose.models.Counter || mongoose.model<CounterDoc>('Counter', counterSchema);

/** Allocate the next numeric id for API-compatible integer primary keys. */
export async function nextId(sequenceName: string): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return counter.seq;
}
