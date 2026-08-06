import mongoose, { Schema } from 'mongoose';

export interface UserDoc {
  _id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: 'student' | 'admin';
  verification_status: 'pending' | 'verified' | 'rejected';
  status: 'active' | 'suspended';
  created_at: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: Number, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    verification_status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

userSchema.set('toJSON', {
  transform(_doc, ret) {
    const value = ret as unknown as Record<string, unknown>;
    value.id = value._id;
    delete value._id;
    delete value.password_hash;
    return value;
  },
});

export const User = mongoose.models.User || mongoose.model<UserDoc>('User', userSchema);

export function toPublicUser(user: UserDoc) {
  return {
    id: user._id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    role: user.role,
    verification_status: user.verification_status,
    status: user.status,
    created_at: user.created_at.toISOString(),
  };
}

export function toAuthUser(user: UserDoc) {
  return {
    id: user._id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    verification_status: user.verification_status,
    status: user.status,
  };
}
