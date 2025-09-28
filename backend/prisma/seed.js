const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Vytvoření admin uživatele
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.create({
    data: {
      email: 'admin@fakturace.cz',
      password: hashedPassword,
      name: 'Administrator',
      role: 'ADMIN'
    }
  });

  // Vytvoření ukázkových organizací
  const organizations = [
    {
      name: 'Lázně Toušeň',
      code: 'LT',
      contactPerson: 'L. Valehrach',
      hourlyRate: 550,
      kmRate: 10,
      email: 'info@laznetousen.cz'
    },
    {
      name: 'Oresi CZ',
      code: 'O',
      contactPerson: 'Jan Novák',
      hourlyRate: 650,
      kmRate: 12,
      email: 'info@oresi.cz'
    },
    {
      name: 'Oresi SK',
      code: 'OSK',
      contactPerson: 'Peter Kováč',
      hourlyRate: 500,
      kmRate: 10,
      email: 'info@oresi.sk'
    },
    {
      name: 'TVM NET GROUP',
      code: 'TVMNET',
      contactPerson: 'Tomáš Veselý',
      hourlyRate: 600,
      kmRate: 11,
      email: 'info@tvmnet.cz'
    }
  ];

  for (const org of organizations) {
    await prisma.organization.create({
      data: org
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