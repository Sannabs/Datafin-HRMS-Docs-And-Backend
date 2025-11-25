import express from "express";
import {
  tenantSignUp,
  userLogin,
  userLogout,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", tenantSignUp);
router.post("/login", userLogin);
router.post("/logout", userLogout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
