import { Schema, model, type Types } from "mongoose";

/** Plain Post document — `author` refs User, `deletedAt` enables soft-delete. */
export interface IPost {
  _id: Types.ObjectId;
  title: string;
  author: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const postSchema = new Schema<IPost>(
  {
    title: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Post = model<IPost>("Post", postSchema);
