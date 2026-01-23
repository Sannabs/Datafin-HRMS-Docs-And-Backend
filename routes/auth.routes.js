import express from "express";
import {
  tenantSignUp,
  getMe,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/signup", tenantSignUp);
router.get("/me", requireAuth, getMe);
export default router;
