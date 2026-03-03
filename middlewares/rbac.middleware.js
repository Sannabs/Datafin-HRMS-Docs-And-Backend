export const requireRole = (allowedRole) => {
    return (req, res, next) => {
      const userRole = req.user?.role;

      if (!userRole) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User is not authenticated",
        });
      }

      if (allowedRole.includes(userRole)) {
        return next();
      }

      // SUPER_ADMIN impersonating a tenant (X-Tenant-Id set) can access tenant routes as if they had the allowed roles
      if (userRole === "SUPER_ADMIN" && req.effectiveTenantId) {
        return next();
      }

      return res.status(403).json({
        error: "Forbidden",
        message: "User does not have the required role",
      });
    };
  };