-- Default currency: Gambian dalasi (GMD) for new rows
ALTER TABLE "SalaryStructure" ALTER COLUMN "currency" SET DEFAULT 'GMD';
ALTER TABLE "Invitation" ALTER COLUMN "salaryCurrency" SET DEFAULT 'GMD';
