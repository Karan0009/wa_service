// import pkg from 'whatsapp-web.js';
// import qrcode from 'qrcode-terminal';
// import { LoggerFactory } from './logger.js';
// import WA_MESSAGE_TEMPLATES from '../templates/wa_messages.js';
// import authService from '../services/auth_service.js';
// import fs from 'node:fs';
// import { promisify } from 'node:util';
// import { join } from 'node:path';
// import rawTransactionLimiter from './raw-transaction-limiter.js';
// import rawTransactionService from '../services/raw_transaction_service.js';
// import {
//   RAW_TRANSACTION_STATUSES,
//   RAW_TRANSACTION_TYPE,
// } from '../models/raw_transaction.js';
// import testSeriesService from '../services/test_series_service.js';

// const writeFileAsync = promisify(fs.writeFile);
// const { Client, LocalAuth } = pkg;

// class WhatsAppWebBot {
//   constructor() {
//     this.logger = new LoggerFactory('WhatsAppWebBot').logger;
//     try {
//       this.client = new Client({
//         puppeteer: {
//           headless: true,
//           args: [
//             '--no-sandbox',
//             '--disable-gpu',
//             '--disable-setuid-sandbox',
//             '--max-old-space-size=512',
//             '--single-process',
//           ],
//         },
//         authStrategy: new LocalAuth(),
//       });

//       this.initialize();
//       this.registerListeners();
//     } catch (err) {
//       this.logger.error('error in initializing wa bot', { error: err });
//     }
//   }

//   async initialize() {
//     this.client.on('qr', (qr) => {
//       qrcode.generate(qr, { small: true });
//       this.logger.info('QR code received, scan please.');
//     });

//     this.client.on('authenticated', () => {
//       this.logger.info('WhatsApp authenticated successfully.');
//     });

//     this.client.on('auth_failure', (msg) => {
//       this.logger.error('Authentication failed:', msg);
//     });

//     this.client.on('ready', () => {
//       this.logger.info('WhatsApp Bot is ready.');
//     });

//     await this.client.initialize();
//   }

//   registerListeners() {
//     this.client.on('message', async (message) => {
//       this.logger.info(
//         `Received message: ${message.body} from ${message.from}`,
//       );
//       await this.handleMessage(message);
//     });
//   }

//   /**
//    *
//    * @param {pkg.Message} message
//    */
//   async handleMessage(message) {
//     const fullPhoneNumber = message.from.split('@')[0];
//     const phoneNumber = fullPhoneNumber.substring(2);
//     try {
//       const user = await authService.doesUserExist(phoneNumber);
//       if (message.body.toLowerCase() === '1') {
//         await this.handleRegisterUser(message);
//       } else if (user) {
//         // TODO: HANDLE TRANSACTION
//         const canTransact = await rawTransactionLimiter.canTransactUserWise(
//           phoneNumber,
//         );
//         if (!canTransact) {
//           await this.sendMessage(
//             message.from,
//             WA_MESSAGE_TEMPLATES.transactions.one_day_maxed_out,
//           );

//           return;
//         }
//         let downloadMediaRes = null;
//         if (message.hasMedia) {
//           downloadMediaRes = await this.downloadMedia(phoneNumber, message);
//         }

//         // * if user is Aashi
//         if (user.id === 'fa4ebfb0-aa82-11ef-990b-037e8c7d24b0') {
//           await this.testSeriesMessageHandler(message, downloadMediaRes);
//           return;
//         }

//         await this.transactionMessageHandler(user, message, downloadMediaRes);
//         // * if any other user, perform following actions
//       } else {
//         await this.sendMessage(
//           message.from,
//           WA_MESSAGE_TEMPLATES.defaultMessage,
//         );
//       }
//     } catch (error) {
//       this.logger.error('error in handle message', { error });
//       this.sendMessage(message.from, WA_MESSAGE_TEMPLATES.defaultErrorMessage);
//     }
//   }

//   async testSeriesMessageHandler(message, downloadMediaRes) {
//     try {
//       const newRawQuestionData = {
//         raw_question_data: message.hasMedia ? downloadMediaRes : 'no data',
//       };
//       const newRawQuestion = await testSeriesService.addRawQuestion(
//         newRawQuestionData,
//       );

//       this.logger.info('new test series question added successfully', {
//         newRawQuestion,
//       });
//       // TODO: WRITE A CRON TO PROCESS unprocessed raw questions by ai
//       // await this.sendMessage(
//       //   message.from,
//       //   WA_MESSAGE_TEMPLATES.testSeries.input_received,
//       // );
//     } catch (error) {
//       this.logger.error('error in testSeriesMessageHandler', { error });
//       throw error;
//     }
//   }

//   async transactionMessageHandler(user, message, downloadMediaRes) {
//     try {
//       const newRawTransactionData = {
//         user_id: user.id,
//         raw_transaction_type: message.hasMedia
//           ? RAW_TRANSACTION_TYPE.WA_IMAGE
//           : RAW_TRANSACTION_TYPE.WA_TEXT,
//         raw_transaction_data: message.hasMedia
//           ? downloadMediaRes
//           : message.body,
//         status: message.hasMedia
//           ? RAW_TRANSACTION_STATUSES.PENDING_TEXT_EXTRACTION
//           : RAW_TRANSACTION_STATUSES.PENDING,
//       };
//       const newRawTransaction = await rawTransactionService.addRawTransaction(
//         newRawTransactionData,
//       );
//       this.logger.info('new transaction added successfully', {
//         newRawTransaction,
//       });

//       await this.sendMessage(
//         message.from,
//         WA_MESSAGE_TEMPLATES.transactions.input_received,
//       );
//     } catch (error) {
//       this.logger.error('error in transactionMessageHandler', { error });
//       throw error;
//     }
//   }

//   async sendMessage(to, message) {
//     try {
//       await this.client.sendMessage(to, message);
//       this.logger.info(`Sent message: ${message} to ${to}`);
//     } catch (error) {
//       this.logger.error(`Failed to send message to ${to}:`, error);
//     }
//   }

//   async handleRegisterUser(message) {
//     if (!message.from) return;
//     const fullPhoneNumber = message.from.split('@')[0];
//     const phoneNumber = fullPhoneNumber.substring(2);
//     try {
//       const { user, alreadyExist } = await authService.registerUser(
//         phoneNumber,
//       );
//       if (alreadyExist)
//         return await this.sendMessage(
//           message.from,
//           WA_MESSAGE_TEMPLATES.register.already_registered,
//         );

//       if (user) {
//         return await this.sendMessage(
//           message.from,
//           WA_MESSAGE_TEMPLATES.register.success,
//         );
//       }
//     } catch (err) {
//       await this.sendMessage(message.from, WA_MESSAGE_TEMPLATES.register.error);
//     }
//   }

//   /**
//    * download image from the message if it exists
//    * @param {pkg.Message} message
//    */
//   async downloadMedia(phoneNumber, message) {
//     try {
//       if (!message.hasMedia) return { mediaPath: null };

//       const media = await message.downloadMedia();

//       if (!media.mimetype.includes('image')) {
//         throw new Error('media is not an image');
//       }

//       const mediaFolderName = 'uploads';
//       const mediaFolderPath = `../../${mediaFolderName}`;
//       if (!fs.existsSync(mediaFolderPath)) {
//         fs.mkdirSync(mediaFolderPath, { recursive: true });
//       }
//       const mediaFilename =
//         media.filename || `${phoneNumber}_trxn_${Date.now()}`; // Fallback in case filename is not available
//       const fileExtension = media.mimetype.split('/')[1]; // Extract file extension from mimetype
//       const fileFolderPath = join(
//         mediaFolderName,
//         `${mediaFilename}.${fileExtension}`,
//       );
//       const filePath = join(
//         import.meta.dirname,
//         mediaFolderPath,
//         `${mediaFilename}.${fileExtension}`,
//       );
//       const writeFileRes = await writeFileAsync(filePath, media.data, {
//         encoding: 'base64',
//       });
//       this.logger.info({ writeFileRes });

//       return fileFolderPath;
//     } catch (error) {
//       this.logger.error('error in downloadMedia', { error });
//       throw error;
//     }
//   }
// }

// export default WhatsAppWebBot;
