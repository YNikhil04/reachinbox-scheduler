import { Router } from "express";
import { createCampaign } from "../controllers/campaign.controller";

const router = Router();

router.post("/campaigns", createCampaign);

export default router;
