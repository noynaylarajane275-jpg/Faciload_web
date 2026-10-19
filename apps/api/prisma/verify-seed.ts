import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [terms, rooms, subjects, users] = await Promise.all([
    prisma.academicTerm.findMany(),
    prisma.room.findMany({ orderBy: { name: 'asc' } }),
    prisma.subject.findMany({ orderBy: { code: 'asc' } }),
    prisma.user.findMany({ select: { email: true, role: true } }),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      terms,
      rooms: rooms.map((r) => r.name),
      subjects: subjects.map((s) => s.code),
      users,
    }),
  );
}

main().finally(async () => prisma.$disconnect());
