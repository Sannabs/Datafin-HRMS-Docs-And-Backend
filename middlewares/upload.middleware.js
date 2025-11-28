import multer from "multer";
import { generateFilename } from "../utils/storage.js";

// Configure multer to use memory storage (we'll upload to R2)
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images are allowed."), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Middleware for multiple product images
export const uploadProductImages = upload.array("images", 10); // Max 10 images

// Middleware for single image (e.g., user profile, category)
export const uploadSingleImage = upload.single("image");
