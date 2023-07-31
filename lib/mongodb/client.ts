// This approach is taken from https://github.com/vercel/next.js/tree/canary/examples/with-mongodb
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI

let client
let clientPromise: Promise<MongoClient>

if (!process.env.MONGODB_URI) {
  throw new Error("Please add your Mongo URI to .env.local")
}

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (typeof uri === 'string') {
    // @ts-ignore
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri)
      // @ts-ignore
      global._mongoClientPromise = client.connect()
    }
  } else {
    console.log("Mongodb uri is not a string")
  }
  // @ts-ignore
  clientPromise = global._mongoClientPromise
  console.log("Mongodb client connected");
} else {
  // In production mode, it's best to not use a global variable.
  if (typeof uri === 'string') {
    // @ts-ignore
    client = new MongoClient(uri)
    clientPromise = client.connect()
  } else {
    console.log("Mongodb uri is not a string")
  }
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
// @ts-ignore
export default clientPromise