/**
 * Whether the user has a stored password on User and/or Better Auth credential account.
 * Better Auth often keeps the hash on Account (providerId "credential"), not User.password.
 */
export function hasStoredLoginCredentials(password, credentialAccounts) {
    const userHasPassword =
        password != null && typeof password === "string" && password.length > 0;
    if (userHasPassword) return true;
    if (!Array.isArray(credentialAccounts)) return false;
    return credentialAccounts.some(
        (a) =>
            a?.password != null &&
            typeof a.password === "string" &&
            a.password.length > 0
    );
}

/** Prisma include fragment for credential accounts (password hash only; strip before JSON). */
export const credentialAccountsInclude = {
    where: { providerId: "credential" },
    select: { password: true },
};
