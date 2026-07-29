/**
 * Run on the production server to inspect auth-related DB state (no secrets printed).
 *
 *   cd appBackend && npx ts-node src/scripts/diagnoseAuth.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../db/prisma';

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  const dbHost = dbUrl.replace(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+).*$/, '$1') || '(unset)';

  const total = await prisma.user.count();
  const active = await prisma.user.count({ where: { NOT: { status: 'TERMINATED' as any } } as any });
  const withPassword = await prisma.user.count({
    where: { passwordHash: { not: null }, NOT: { status: 'TERMINATED' as any } } as any,
  });
  const byProvider = await prisma.user.groupBy({
    by: ['provider'],
    where: { NOT: { status: 'TERMINATED' as any } } as any,
    _count: { _all: true },
  });

  const duplicateEmails = await prisma.$queryRaw<Array<{ email_lower: string; cnt: bigint }>>`
    SELECT lower(email) AS email_lower, COUNT(*)::bigint AS cnt
    FROM "User"
    WHERE status <> 'TERMINATED'
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `;

  console.log('--- 7a-side auth diagnostics ---');
  console.log('DATABASE host:', dbHost);
  console.log('Users total:', total, '| active (non-TERMINATED):', active);
  console.log('Active users with passwordHash:', withPassword);
  console.log('Active users by provider:', byProvider);
  console.log(
    'Duplicate active emails (case-insensitive):',
    duplicateEmails.length === 0
      ? 'none'
      : duplicateEmails.map((r) => `${r.email_lower} (${r.cnt})`).join(', '),
  );

  if (active === 0) {
    console.log('\n⚠ No active users — backend may be pointing at an empty/wrong database.');
  } else if (withPassword === 0) {
    console.log('\n⚠ No email/password accounts — users must sign in with Google (or reset passwords).');
  } else if (duplicateEmails.length > 0) {
    console.log('\n⚠ Duplicate emails detected — email login may hit the wrong row. Deploy latest auth fix.');
  } else {
    console.log('\n✓ User records look plausible. If login still fails, check backend logs for POST /auth/login-email.');
  }
}

main()
  .catch((e) => {
    console.error('diagnoseAuth failed:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
