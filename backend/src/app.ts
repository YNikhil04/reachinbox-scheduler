import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import passport from "./config/passport";
import authRoutes from "./routes/auth.routes";
import meRoutes from "./routes/me.routes";
import uploadRoutes from "./routes/upload.routes";
import campaignRoutes from "./routes/campaign.routes";
import emailRoutes from "./routes/email.routes";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, // required so cookies/session travel with requests
  }),
);
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/api", meRoutes);

app.use("/api", uploadRoutes);
app.use("/api", campaignRoutes);

app.use("/api", emailRoutes);

export default app;
