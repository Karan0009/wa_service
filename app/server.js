import express from 'express';
import cors from 'cors';
import router from './routes/router.js';
import sequelize from './lib/sequelize.js';
import { LoggerFactory } from './lib/logger.js';
import { createNamespace } from 'cls-hooked';
import config from './config/config.js';
import setRequestId from './middlewares/set_request_id.js';
import { join } from 'node:path';
import requestLogger from './middlewares/req_logger.js';
import responseLogger from './middlewares/res_logger.js';

cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept'],
});
const app = express();
const logger = new LoggerFactory('server.js').logger;
createNamespace(`${config.APP_NAME}-req-context`);

app.use(express.json({}));
app.use(setRequestId);
app.use(requestLogger);
// app.use(responseLogger);
app.use('/static', express.static(join(config.MEDIA_UPLOAD_PATH, 'uploads')));
app.use(router);

(async () => {
  try {
    await sequelize.authenticate();
    // const sql = await sequelize.sync({ alter: true });
  } catch (error) {
    logger.error('Unable to connect to the database', { error });
  }
})();

export default app;
