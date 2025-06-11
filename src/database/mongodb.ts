import { Db, MongoClient } from "mongodb";
import { DB_URI, NODE_ENV } from "../../config/env";

if (!DB_URI) {
  throw new Error(
    "Please define DB_URI in .env.<development/production>.local",
  );
}

let db: Db; // Store database instance
let client: MongoClient; // Store client instance

const connectToDatabase = async () => {
  try {
    client = new MongoClient(DB_URI as string);
    await client.connect();
    db = client.db("hr_database");
    console.log(`Connected to database in ${NODE_ENV} mode`);
    return db; // Return db instance
  } catch (error) {
    console.error("Error connecting to database:", error);
    process.exit(1);
  }
};

// Function to get the existing database instance
export const getDb = () => {
  if (!db) throw new Error("Database not initialized");
  return db;
};

// Function to get the existing client instance
export const getClient = () => {
  if (!client) throw new Error("Client not initialized");
  return client;
};

export default connectToDatabase;
