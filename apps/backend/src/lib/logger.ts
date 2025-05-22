import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

export const sanitizeError = (error: any): any => {
  if (isProduction) {
    // In production, return a generic error message
    // and log only essential, non-sensitive details if necessary.
    // Avoid logging the full error object directly to prevent data leaks.
    return { message: 'An unexpected error occurred.' };
  }
  // In development, return more detailed error information.
  return {
    message: error.message,
    stack: error.stack,
    ...(error.response?.data && { data: error.response.data }), // For Axios errors
    ...(error.errors && { validationErrors: error.errors }), // For validation libraries
  };
};

export default logger;
