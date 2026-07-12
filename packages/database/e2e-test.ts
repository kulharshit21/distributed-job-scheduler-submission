import { PrismaClient } from '@prisma/client';
import { fork } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

async function runConcurrencyTest() {
  console.log('Starting E2E Concurrency Test for SKIP LOCKED...');

  // 1. Setup Data
  const rand = Math.random().toString(36).substring(7);
  const org = await prisma.organization.create({ data: { name: 'Test Org', slug: `test-org-e2e-${rand}` } });
  const user = await prisma.user.create({ data: { email: `test-${rand}@e2e.com`, password_hash: '123', role: 'admin', organization: { connect: { id: org.id } } } });
  const project = await prisma.project.create({ data: { name: 'Test Project', slug: `test-proj-e2e-${rand}`, organization: { connect: { id: org.id } }, created_by: user.id } });
  const queue = await prisma.queue.create({ 
    data: { name: 'Test Queue', project: { connect: { id: project.id } }, concurrency_limit: 50 } 
  });

  console.log(`Created Queue ID: ${queue.id}`);

  // 2. Insert 50 jobs
  const jobsToInsert = Array.from({ length: 50 }).map((_, i) => ({
    queue_id: queue.id,
    type: 'test_job',
    payload: { index: i },
    status: 'queued',
    max_attempts: 3,
    run_at: new Date()
  }));
  await prisma.job.createMany({ data: jobsToInsert });
  
  console.log(`Inserted 50 jobs into Queue. Status: queued.`);

  // 3. Start 3 worker instances to simulate horizontal scaling and test race conditions
  console.log('Spawning 3 worker processes...');
  const workers = [];
  for (let i = 0; i < 3; i++) {
    const workerProcess = fork(path.join(__dirname, '../../apps/worker/dist/main.js'), [], {
      env: { ...process.env, PORT: `${3001 + i}` } // Avoid port conflicts if worker listens to any
    });
    workers.push(workerProcess);
  }

  // 4. Wait for jobs to complete (poll database)
  console.log('Waiting for jobs to be processed...');
  let completed = 0;
  for (let i = 0; i < 30; i++) {
    completed = await prisma.job.count({ where: { queue_id: queue.id, status: 'completed' } });
    if (completed === 50) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  // 5. Assertions
  console.log(`\n--- Test Results ---`);
  console.log(`Total Jobs Completed: ${completed} / 50`);
  
  // Verify exactly 50 executions (no duplicates)
  const executions = await prisma.jobExecution.count({
    where: { job: { queue_id: queue.id } }
  });
  
  console.log(`Total Job Executions: ${executions}`);
  
  if (completed === 50 && executions === 50) {
    console.log('✅ TEST PASSED: 100% processing rate with 0 duplicate executions across multiple workers!');
    console.log('PostgreSQL SKIP LOCKED successfully prevented race conditions.');
  } else {
    console.log('❌ TEST FAILED: Race condition detected or jobs did not finish.');
  }

  // 6. Cleanup
  workers.forEach(w => w.kill());
  
  await prisma.jobExecution.deleteMany({ where: { job: { queue_id: queue.id } } });
  await prisma.job.deleteMany({ where: { queue_id: queue.id } });
  await prisma.queue.delete({ where: { id: queue.id } });
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.$disconnect();
  
  if (completed !== 50 || executions !== 50) {
    process.exit(1);
  }
}

runConcurrencyTest().catch(console.error);
