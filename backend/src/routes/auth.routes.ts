import { Router } from "express";
import passport from "../config/passport";

const router = Router();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "http://localhost:3000/login",
    session: true,
  }),
  (req, res) => {
    // successful login — redirect to frontend dashboard
    res.redirect("http://localhost:3000/dashboard");
  },
);

router.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("http://localhost:3000/login");
  });
});

export default router;
