import config from '../../config/config.js';
import BaseWorker from '../base/base_worker.js';
import TestSeriesQuestionsJob from '../jobs/test_series_questions_job.js';

export default class RawTransactionsImgToTextProcessor extends BaseWorker {
  constructor() {
    super({
      queueName: config.BULL_MQ_QUEUES.rawTransactionsImgToTextQueue,
      workerOptions: {
        name: config.BULL_MQ_QUEUES.rawTransactionsImgToTextQueue,
        concurrency: 1,
        removeOnComplete: true,
      },
    });
  }

  /**
   *
   * @param {Job} job
   */
  async jobProcessor(job) {
    await new TestSeriesQuestionsJob().process();
  }
}
