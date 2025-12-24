const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const { toCents } = require(path.join(__dirname, '../dist/utils/money'));

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);

  await prisma.user.create({
    data: {
      email: 'admin@fakturace.cz',
      password: hashedPassword,
      name: 'Administrator',
      role: UserRole.ADMIN,
    },
  });

  const organizations = [
    {
      name: 'Lázně Toušeň',
      code: 'LT',
      contactPerson: 'L. Valehrach',
      hourlyRateCents: toCents(550),
      kilometerRateCents: toCents(10),
      email: 'info@laznetousen.cz',
    },
    {
      name: 'Oresi CZ',
      code: 'O',
      contactPerson: 'Jan Novák',
      hourlyRateCents: toCents(650),
      kilometerRateCents: toCents(12),
      email: 'info@oresi.cz',
    },
    {
      name: 'Oresi SK',
      code: 'OSK',
      contactPerson: 'Peter Kováč',
      hourlyRateCents: toCents(500),
      kilometerRateCents: toCents(10),
      email: 'info@oresi.sk',
    },
    {
      name: 'TVM NET GROUP',
      code: 'TVMNET',
      contactPerson: 'Tomáš Veselý',
      hourlyRateCents: toCents(600),
      kilometerRateCents: toCents(11),
      email: 'info@tvmnet.cz',
    },
  ];

  for (const org of organizations) {
    await prisma.organization.create({
      data: {
        ...org,
        hardwareMarginPct: 10,
        softwareMarginPct: 12,
        outsourcingFeeCents: toCents(1500),
      },
    });
  }

  console.log('Seed data vytvořena úspěšně');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
