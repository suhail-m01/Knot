import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Hyperlocal anchors (Bengaluru neighbourhoods). The _id is a stable slug such as "koramangala".
const localitySchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    aliases: { type: [String], default: [] },
    city: { type: String, required: true, default: 'Bengaluru' },
    country: { type: String, required: true, default: 'IN' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { versionKey: false },
);

localitySchema.index({ city: 1, name: 1 });

export const Locality = model('Locality', localitySchema);
