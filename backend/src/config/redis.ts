import IORedis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const connection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // required by BullMQ
});

export default connection;
