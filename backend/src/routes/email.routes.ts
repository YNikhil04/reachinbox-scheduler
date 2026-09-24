import { Router } from "express";
import { listEmails } from "../controllers/email.controller";

const router = Router();

router.get("/emails", listEmails);

export default router;
