const Bull = require('bull');
const redisConfig = require('../config/redis');

class QueueManager {
  constructor() {
    this.queues = new Map();
    this.redisClient = redisConfig.getConnection('queue');
  }

  createQueue(name, options = {}) {
    if (this.queues.has(name)) {
      return this.queues.get(name);
    }

    const queueOptions = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB, 10) || 0,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
      },
      ...options,
    };

    const queue = new Bull(name, queueOptions);
    
    // Event handlers
    queue.on('error', (error) => {
      console.error(`❌ Queue ${name} error:`, error);
    });
    
    queue.on('failed', (job, err) => {
      console.error(`❌ Job ${job.id} failed in queue ${name}:`, err);
    });
    
    queue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed in queue ${name}`);
    });
    
    queue.on('stalled', (job) => {
      console.warn(`⚠️ Job ${job.id} stalled in queue ${name}`);
    });
    
    this.queues.set(name, queue);
    return queue;
  }

  getQueue(name) {
    return this.queues.get(name);
  }

  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    const job = await queue.add(jobName, data, options);
    return job;
  }

  async addBulk(queueName, jobs) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    const addedJobs = await queue.addBulk(jobs);
    return addedJobs;
  }

  async getJobCounts(queueName) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    return await queue.getJobCounts();
  }

  async cleanQueue(queueName, gracePeriod = 5000) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    await queue.clean(gracePeriod, 'completed');
    await queue.clean(gracePeriod, 'failed');
  }

  async pauseQueue(queueName) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    await queue.pause();
  }

  async resumeQueue(queueName) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    await queue.resume();
  }

  async closeAll() {
    const closePromises = [];
    for (const [name, queue] of this.queues) {
      console.log(`🔌 Closing queue: ${name}`);
      closePromises.push(queue.close());
    }
    await Promise.all(closePromises);
    console.log('✅ All queues closed');
  }
}

// Singleton instance
const queueManager = new QueueManager();

// Define standard queues
const QUEUES = {
  EMAIL: 'email_queue',
  QR_GENERATION: 'qr_queue',
  MPESA_CALLBACK: 'mpesa_queue',
  TICKET_SCAN: 'scan_queue',
  NOTIFICATION: 'notification_queue',
  REPORT: 'report_queue',
};

module.exports = { queueManager, QUEUES };