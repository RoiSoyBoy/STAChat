import { Request, Response, NextFunction } from 'express';
import logger, { sanitizeError } from '../lib/logger';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log the error
  if (process.env.NODE_ENV === 'development' || !isOperational) {
    // Log more details in development or for non-operational (unexpected) errors
    logger.error(
      {
        err,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        body: req.body, // Be cautious logging request body in production if it contains sensitive data
        query: req.query,
        params: req.params,
      },
      `Error in ${req.method} ${req.originalUrl}`
    );
  } else if (isOperational) {
    // For operational errors in production, log a simpler message
    logger.warn(
      {
        statusCode,
        message: err.message,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
      },
      `Operational error: ${err.message}`
    );
  }

  // Prepare the error response
  const errorResponse = sanitizeError(err);

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    ...errorResponse,
  });
};

export class ApiError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype); // Restore prototype chain
    Error.captureStackTrace(this, this.constructor);
  }
}

export default errorHandler;
