import express from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';


const router = express.Router();

router.post("/", requireAuth, requireRole("HR_ADMIN"), sendInvitation)
router.get("/", requireAuth, getInvitations)
router.post("/accept/:token", acceptInvitation)


export default router;