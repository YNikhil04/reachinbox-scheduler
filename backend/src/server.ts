import app from "./app";
import redisConnection from "./config/redis";
import prisma from "./config/db";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // sanity check DB connection on boot
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
