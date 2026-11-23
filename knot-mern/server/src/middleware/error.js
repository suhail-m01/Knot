import { z } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, `No API route for ${req.method} ${req.originalUrl}`));
}

/** Central error handler: maps validation, Mongo and domain errors to consistent JSON. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Please check the highlighted fields.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request body is too large.' });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    return res.status(409).json({ error: `That ${field} is already in use.` });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: 'One of the identifiers in the request is invalid.' });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      error: 'The data could not be saved because it did not pass validation.',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
  }
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
