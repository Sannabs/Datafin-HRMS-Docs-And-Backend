export const requireRole = (allowedRole) => {
    return (req, res, next) => {
      const userRole = req.user?.role;
  
      if (!userRole) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User is not authenticated",
        });
      }
  
      if (!allowedRole.includes(userRole)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "User does not have the required role",
        });
      }
      next();
    };
  };