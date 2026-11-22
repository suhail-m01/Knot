export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, message, details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, message);
export const forbidden = (message = 'You do not have permission to do that') => new AppError(403, message);
export const notFound = (message = 'Not found') => new AppError(404, message);
export const conflict = (message, details) => new AppError(409, message, details);
export const unprocessable = (message, details) => new AppError(422, message, details);
