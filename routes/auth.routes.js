import express from "express";
import {
  tenantSignUp,
  getMe,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", tenantSignUp);
router.get("/me", getMe);
export default router;
