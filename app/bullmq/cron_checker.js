import { LoggerFactory } from '../lib/logger.js';
import TestSeriesQuestionsJob from './jobs/test_series_questions_job.js';

class CronChecker {
  constructor() {
    this.logger = new LoggerFactory('CronChecker').logger;
  }

  async startCronChecker(ms) {
    // start the first time and then check every on every ms interval
    await this.addCronJobsIfNotAlreadyAdded();
    setInterval(async function () {
      await this.addCronJobsIfNotAlreadyAdded();
    }, ms);
  }

  async addCronJobsIfNotAlreadyAdded() {
    try {
      const testSeriesQuestionsJob = new TestSeriesQuestionsJob();
      const testSeriesQuestionsJobs =
        await testSeriesQuestionsJob.queue.getActiveCount();

      if (testSeriesQuestionsJobs === 0) {
        this.logger.info('testSeriesQuestionsJob has 0 jobs, adding new job');
        await testSeriesQuestionsJob.add({});
      }

      this.logger.info('all cron jobs are active');
    } catch (err) {
      this.logger.error('error in addCronJobsIfNotAlreadyAdded', { err });
    }
  }
}

export default new CronChecker();
