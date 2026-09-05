import "../src/lib/env.js";
import { ensureAdminUser } from "../src/lib/auth/ensure-admin.js";

const main = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD env vars are required");
    process.exit(1);
  }

  const result = await ensureAdminUser({ email, password, name });

  if (result.createdUser) {
    console.warn(`created user ${email} (id=${result.userId})`);
  } else {
    console.warn(`user ${email} already exists (id=${result.userId}) → ensured admin`);
  }
  if (result.createdAccount) {
    console.warn(`created credential account for ${email}`);
  } else {
    console.warn(`updated credential password for ${email}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("bootstrap-admin failed", err);
    process.exit(1);
  });
