import multer from "multer";

const storage = multer.memoryStorage();

const csvFilter = (req, file, cb) => {
    const ok =
        file.mimetype === "text/csv" ||
        file.mimetype === "application/vnd.ms-excel" ||
        file.originalname?.toLowerCase().endsWith(".csv");
    if (ok) cb(null, true);
    else cb(new Error("Only CSV files are allowed"), false);
};

export const uploadCsvSingle = multer({
    storage,
    fileFilter: csvFilter,
    limits: { fileSize: 15 * 1024 * 1024 },
}).single("file");
