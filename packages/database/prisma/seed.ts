import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const prisma = new PrismaClient({});

async function main() {
  console.log('Seeding database...');
  
  // 1. Create default organization
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
    }
  });

  // 2. Create default user
  const hashedPassword = await argon2.hash('password123');
  const user = await prisma.user.upsert({
    where: { email: 'demo@acmecorp.com' },
    update: {},
    create: {
      email: 'demo@acmecorp.com',
      password_hash: hashedPassword,
      org_id: org.id,
      role: 'owner',
    }
  });

  // 3. Create Project
  const project = await prisma.project.create({
    data: {
      name: 'Demo Pipeline',
      slug: 'demo-pipeline',
      org_id: org.id,
      created_by: user.id
    }
  });

  // 4. Create Queue
  const queue = await prisma.queue.create({
    data: {
      project_id: project.id,
      name: 'default',
      concurrency_limit: 10,
    }
  });

  // 5. Create some demo jobs
  for (let i = 0; i < 5; i++) {
    await prisma.job.create({
      data: {
        queue_id: queue.id,
        type: 'email_send',
        payload: { to: `user${i}@example.com` },
        max_attempts: 3,
        status: 'queued',
        run_at: new Date(),
      }
    });
  }

  console.log('Database seeded successfully!');
  console.log(`Login with demo@acmecorp.com / password123`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
