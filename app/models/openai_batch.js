import { DataTypes, Model } from 'sequelize';
import sequelize from '../lib/sequelize.js';

const OPENAI_BATCH_STATUS = {
  INIT: 'INIT',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  INVALID_BATCH_JOB: 'INVALID_BATCH_JOB',
};

export default class OpenaiBatch extends Model {}

OpenaiBatch.init(
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    remark: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    batch_job: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: OPENAI_BATCH_STATUS.INIT,
    },
  },
  {
    sequelize,
    modelName: 'OpenaiBatch',
    tableName: 'openai_batches',
  },
);

export { OPENAI_BATCH_STATUS };
