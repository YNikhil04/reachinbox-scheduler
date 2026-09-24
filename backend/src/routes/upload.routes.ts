import { Router } from "express";
import multer from "multer";
import { parseRecipientsFromCsv } from "../services/csv.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload-csv", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { emails, count } = parseRecipientsFromCsv(req.file.buffer);
  res.json({ emails, count });
});

export default router;
