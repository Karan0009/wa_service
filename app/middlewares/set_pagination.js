import config from '../config/config.js';

/**
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const setPagination = async (req, _, next) => {
  try {
    let limit = parseInt(req.query.limit);
    let page = parseInt(req.query.page);
    if (isNaN(limit)) {
      limit = config.DEFAULT_GET_REQUEST_LIMIT;
    }
    if (isNaN(page)) {
      page = 1;
    }
    let offset = (page - 1) * limit;
    req.query.limit = limit;
    req.query.offset = offset;
    req.query.page = page;
    next();
  } catch (error) {
    next(error);
  }
};

export default setPagination;
