import crypto from "crypto";

/** Align with Better Auth sign-in, which resolves users by lowercased email. */
export function normalizeAuthEmail(email) {
    if (email == null || typeof email !== "string") return "";
    return email.trim().toLowerCase();
}

/**
 * Better Auth email/password sign-in verifies password on Account (providerId "credential"),
 * not User.password alone. Call when credentials are set outside auth.api (e.g. invite accept).
 * @param {*} db - Prisma client or interactive transaction client
 */
export async function upsertCredentialAccount(db, userId, hashedPassword) {
    const credAccount = await db.account.findFirst({
        where: { userId, providerId: "credential" },
    });
    if (credAccount) {
        await db.account.update({
            where: { id: credAccount.id },
            data: { password: hashedPassword },
        });
    } else {
        await db.account.create({
            data: {
                id: crypto.randomUUID(),
                userId,
                accountId: userId,
                providerId: "credential",
                password: hashedPassword,
            },
        });
    }
}

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
