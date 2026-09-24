/**
 * Creates a platform SUPER_ADMIN user (tenantId = null) — once per environment.
 * Run: npm run create:super-admin -w apps/api -- <email> <password> <fullName>
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLES } from '@my-store/shared';

const prisma = new PrismaClient();

async function main() {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password || !fullName) {
    console.error('Usage: create:super-admin <email> <password> "<fullName>"');
    process.exit(1);
  }

  const role = await prisma.role.findFirst({ where: { tenantId: null, key: ROLES.SUPER_ADMIN } });
  if (!role) throw new Error('SUPER_ADMIN role not found — run seed first');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, fullName, tenantId: null, roleId: role.id },
    update: { passwordHash, fullName, roleId: role.id },
  });

  console.log(`SUPER_ADMIN created/updated: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
