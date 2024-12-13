import config from '../../config/config.js';
import BaseJob from '../base/base_job.js';
import { writeFile } from 'node:fs/promises';
import TestSeriesRawQuestion, {
  TEST_SERIES_RAW_QUESTION_STATUSES,
} from '../../models/test_series_raw_question.js';
import sequelize from '../../lib/sequelize.js';
import { Op, Transaction } from 'sequelize';
import openaiClient from '../../lib/openai/openai.js';
import OpenaiBatch, { OPENAI_BATCH_STATUS } from '../../models/openai_batch.js';
import TestSeriesQuestion from '../../models/test_series_question.js';
const __dirname = import.meta.dirname;

export default class TestSeriesQuestionsBatchesJob extends BaseJob {
  constructor() {
    super({
      queueName: config.BULL_MQ_QUEUES.testSeriesQuestionsBatchesQueue,
      jobOptions: {
        repeat: {
          pattern: '*/5 * * * *',
        },
      },
    });
  }

  async process(jobData) {
    let sqlTransaction;
    try {
      this.logger.info('job ran', { jobData });
      sqlTransaction = await sequelize.transaction();
      const pendingBatches = await this.getPendingBatches();

      await this.getAndUpdateProcessedBatchJobs(pendingBatches, sqlTransaction);

      if (sqlTransaction) await sqlTransaction.commit();
    } catch (error) {
      if (sqlTransaction) {
        await sqlTransaction.rollback();
      }
      this.logger.error('error in process', { error });
      throw error;
    }
  }

  async getPendingBatches(transaction) {
    return OpenaiBatch.findAll({
      where: {
        status: OPENAI_BATCH_STATUS.PENDING,
        batch_job: { [Op.not]: null },
      },
      order: [['id', 'ASC']],
      limit: config.TEST_SERIES_QUESTIONS_BATCHES_JOB_BATCH_SIZE,
      transaction,
    });
  }

  async setOpenaiBatchStatus(batchIds, status, transaction) {
    return OpenaiBatch.update(
      {
        status,
      },
      {
        where: {
          id: batchIds || [],
          status: OPENAI_BATCH_STATUS.PENDING,
        },

        transaction,
      },
    );
  }

  /**
   *
   * @param {Array<OpenaiBatch>} pendingBatches
   * @param {Transaction} transaction
   */
  async getAndUpdateProcessedBatchJobs(pendingBatches, transaction) {
    try {
      const processedBatches = [];
      const failedBatches = [];
      for (let i = 0; i < pendingBatches.length; ++i) {
        const batch = pendingBatches[i];
        let batchJob;
        if (batch?.batch_job) {
          batchJob = await openaiClient.batches.retrieve(batch?.batch_job?.id);
        }
        if (batchJob && batchJob?.status === 'completed') {
          await batch.update(
            {
              status: OPENAI_BATCH_STATUS.PROCESSING,
            },
            {
              transaction,
            },
          );
          processedBatches.push({ batchJob, batch });
        } else if (batchJob && batchJob?.status === 'failed') {
          failedBatches.push({
            batch,
            batchJob,
            failedRemark: batchJob?.errors?.data[0]?.code,
          });
        } else {
          this.logger.error(
            'either null batchJob or different batchJob status',
            {
              status: batchJob?.status || '',
            },
          );
        }
      }

      await this.handleRetryFailedBatches(failedBatches, transaction);

      const processedFilesContent = [];
      for (let i = 0; i < processedBatches.length; ++i) {
        const processedBatch = processedBatches[i];
        const resultFileId = processedBatch.batchJob.output_file_id;

        const resultObjects = await this.openaiFileToJsonObjects(resultFileId);
        if (!resultObjects) {
          continue;
        }

        await processedBatch.batch.update(
          {
            status: OPENAI_BATCH_STATUS.PROCESSED,
          },
          {
            transaction,
          },
        );
        processedFilesContent.push(...resultObjects);
      }

      for (let i = 0; i < processedFilesContent.length; ++i) {
        const result = processedFilesContent[i];
        const rawQuestionId = result?.custom_id;
        const response = JSON.parse(
          result?.response?.body?.choices[0].message.content,
        );

        // todo: create test_series_question
        const rawQuestion = await TestSeriesRawQuestion.findOne({
          where: {
            id: rawQuestionId,
            status: TEST_SERIES_RAW_QUESTION_STATUSES.PROCESSING,
          },
          transaction,
        });
        if (!rawQuestion) {
          this.logger.error('raw processing question not found', {
            rawQuestionId,
          });
          continue;
        }
        const newProcessedQuestion = await TestSeriesQuestion.create(
          {
            question: response?.question || '',
            meta: response,
            question_added_date: rawQuestion.created_at,
          },
          {
            transaction,
          },
        );

        await rawQuestion.update(
          {
            status: TEST_SERIES_RAW_QUESTION_STATUSES.PROCESSED,
            question_id: newProcessedQuestion.id,
          },
          {
            transaction,
          },
        );
      }

      return processedBatches;
    } catch (error) {
      this.logger.error('error in getProcessedBatches', { error });
      throw error;
    }
  }

  /**
   *
   * @param {Array<{batch:OpenaiBatch,batchJob:import('openai/resources/batches.mjs').Batch,failedRemark:string}>} failedBatches
   * @param {*} transaction
   */
  async handleRetryFailedBatches(failedBatches, transaction) {
    for (let i = 0; i < failedBatches.length; ++i) {
      try {
        const { batch, batchJob, failedRemark } = failedBatches[i];

        const inputFileObjects = await this.openaiFileToJsonObjects(
          batchJob.input_file_id,
        );

        if (!inputFileObjects) {
          continue;
        }

        await batch.update(
          {
            status: OPENAI_BATCH_STATUS.FAILED,
            remark: failedRemark,
            batch_job: batchJob,
          },
          {
            transaction,
          },
        );
        const customIds = inputFileObjects
          .map((o) => o.custom_id)
          .filter((str) => str);

        await TestSeriesRawQuestion.update(
          {
            status: TEST_SERIES_RAW_QUESTION_STATUSES.PENDING,
          },
          {
            where: {
              id: customIds || [],
            },
            transaction,
          },
        );
      } catch (error) {
        this.logger.error('error in handleRetryFailedBatches', { error });
        continue;
      }
    }
  }

  async openaiFileToJsonObjects(fileId) {
    try {
      let fileObj;
      fileObj = await openaiClient.files.content(fileId);

      let resultObjects;
      if (fileObj) {
        const fileContent = await fileObj.text();
        resultObjects = fileContent
          .split('\n')
          .filter((o) => o)
          .map((o) => JSON.parse(o));
      }

      return resultObjects;
    } catch (error) {
      this.logger.error('error in openaiFileToJsonObjects', {
        error,
      });

      return null;
    }
  }

  /**
   *
   * @param {Array<{batchJob:import('openai/resources/batches.mjs').Batch, batch:OpenaiBatch}} processedBatchJobs
   */
  async saveProcessedBatchJobs(processedBatchJobs) {
    try {
      for (let i = 0; i < processedBatchJobs.length; ++i) {
        const { batch, batchJob } = processedBatchJobs[i];
        const resultFileId = batchJob.output_file_id;
        const result = await openaiClient.files.content(resultFileId).content;

        const processedBatchesFolder = 'openai_batch_files/processed';
        // if()
        const processedBatchFilePath = `${processedBatchesFolder}/test_series_questions_processed_batch_${batch.id}`;
        await writeFile(processedBatchFilePath, JSON.stringify(result));
      }
    } catch (error) {
      this.logger.error('error in saveProcessedBatchJobs', { error });
    }
  }
}