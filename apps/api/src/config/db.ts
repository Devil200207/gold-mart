import mongoose from 'mongoose';
import { env } from './env';

// The app's DB user cannot create indexes or collections; scripts/setup-db-roles.ts does that.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
mongoose.set('strictQuery', true);

export async function connectDb(uri: string = env.MONGO_URI): Promise<typeof mongoose> {
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
