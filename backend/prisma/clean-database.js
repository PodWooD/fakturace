const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('🧹 Mazání všech dat z databáze...');
  
  try {
    // Smazat v pořadí závislostí
    console.log('  - Mazání faktur...');
    await prisma.invoice.deleteMany({});
    
    console.log('  - Mazání pracovních výkazů...');
    await prisma.workRecord.deleteMany({});
    
    console.log('  - Mazání hardware...');
    await prisma.hardware.deleteMany({});
    
    console.log('  - Mazání služeb...');
    await prisma.service.deleteMany({});
    
    console.log('  - Mazání organizací...');
    await prisma.organization.deleteMany({});
    
    // Zachovat uživatele (admin účet)
    console.log('  ✓ Uživatelé zachováni');
    
    console.log('\n✅ Databáze vyčištěna!');
    console.log('📝 Nyní můžete importovat nová data.');
    
  } catch (error) {
    console.error('❌ Chyba při mazání dat:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanDatabase();