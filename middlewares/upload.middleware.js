import multer from "multer";

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

// File filter for leave request attachments: images + PDF + common docs
const leaveAttachmentFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Allowed: images, PDF, Word."), false);
  }
};

// File filter for employee documents: images + PDF + common docs
const employeeDocumentFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Allowed: images, PDF, Word."), false);
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

// Middleware for leave request attachments (multiple files, optional)
const uploadLeaveStorage = multer.memoryStorage();
const uploadLeave = multer({
  storage: uploadLeaveStorage,
  fileFilter: leaveAttachmentFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});
export const uploadLeaveAttachments = uploadLeave.array("attachments", 10);

const uploadEmployeeDocumentStorage = multer.memoryStorage();
const uploadEmployeeDocument = multer({
  storage: uploadEmployeeDocumentStorage,
  fileFilter: employeeDocumentFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});
export const uploadEmployeeDocuments = uploadEmployeeDocument.array("documents", 10);
