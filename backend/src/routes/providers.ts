import { Router } from "express";
import { providers } from "../config/providers.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(
    providers.map((p) => ({
      id: p.id,
      name: p.name,
      models: p.defaultModels,
    }))
  );
});

export default router;
