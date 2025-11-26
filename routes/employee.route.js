import express from "express";
import {
    getAllEmployees,
    getEmployeeById,
    updateEmployee,
    terminateEmployee,
    reactivateEmployee,
    archiveEmployee,
    restoreEmployee,
} from "../controllers/employee.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// All employee routes require authentication
router.use(requireAuth);

// GET /api/employees - Get all employees
router.get("/", getAllEmployees);

// GET /api/employees/:id - Get employee by id
router.get("/:id", getEmployeeById);

// PUT /api/employees/:id - Update employee by id
router.put("/:id", updateEmployee);

// POST /api/employees/:id/terminate - Terminate employee by id
router.post("/:id/terminate", terminateEmployee);

// POST /api/employees/:id/reactivate - Reactivate employee by id
router.post("/:id/reactivate", reactivateEmployee);

// POST /api/employees/:id/archive - Archive employee by id
router.post("/:id/archive", archiveEmployee);

// POST /api/employees/:id/restore - Restore employee by id
router.post("/:id/restore", restoreEmployee);

export default router;

