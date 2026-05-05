/**
 * One-off repair: users created via invite accept (before credential Account sync)
 * have User.password set but no Account row (providerId "credential"), so Better Auth
 * email sign-in fails. This copies the existing hash from User.password into Account.
 *
 * Usage (from Datafin-HRMS-Docs-And-Backend, with DATABASE_URL in .env):
 *   node ./scripts/repair-credential-accounts-from-user-password.js        # dry-run
 *   node ./scripts/repair-credential-accounts-from-user-password.js --apply
 */
import "dotenv/config";
import prisma from "../config/prisma.config.js";
import { upsertCredentialAccount } from "../utils/loginCredentials.util.js";

const apply = process.argv.includes("--apply");

function userHasPasswordField(pw) {
  return pw != null && typeof pw === "string" && pw.length > 0;
}

function needsRepair(user) {
  if (!userHasPasswordField(user.password)) return false;
  const cred = user.accounts?.[0];
  if (!cred) return true;
  return !userHasPasswordField(cred.password);
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
      password: { not: null },
    },
    select: {
      id: true,
      email: true,
      tenantId: true,
      password: true,
      accounts: {
        where: { providerId: "credential" },
        select: { id: true, password: true },
      },
    },
  });

  const targets = users.filter(needsRepair);

  console.log(
    `Scanned ${users.length} user(s) with non-null password field; ${targets.length} need credential Account repair.`
  );

  for (const u of targets) {
    const line = `${apply ? "REPAIR" : "would repair"}\t${u.id}\t${u.email}\t(tenant ${u.tenantId})`;
    console.log(line);
    if (apply) {
      await upsertCredentialAccount(prisma, u.id, u.password);
    }
  }

  if (!apply && targets.length > 0) {
    console.log("\nDry-run only. Re-run with --apply to write Account rows.");
  }
  if (apply && targets.length > 0) {
    console.log(`\nUpdated ${targets.length} user(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
