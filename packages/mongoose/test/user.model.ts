import { Schema, model, type Types } from "mongoose";

/** Plain User document (explicit for clean field-key inference). */
export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number, default: null }, // nullable — exercises SQL-style null handling
  },
  { timestamps: true },
);

export const User = model<IUser>("User", userSchema);
