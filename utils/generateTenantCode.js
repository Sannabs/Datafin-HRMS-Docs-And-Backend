// Format: First 3 letters of company name (uppercase)
// Example: "Acme Corporation" -> "ACM"
export const generateTenantCode = (companyName) => {
  const code = companyName
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 3)
    .toUpperCase();

  return code;
};
