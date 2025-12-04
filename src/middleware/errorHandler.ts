import { Request, Response, NextFunction } from 'express';

interface IError extends Error {
  statusCode?: number;
  code?: string;
  errors?: any; // Add errors property for Mongoose validation errors
}

export const errorHandler = (err: IError, req: Request, res: Response, next: NextFunction) => {
  let error = { ...err };
  error.message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found`;
    error = { ...error, message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === '11000') {
    const message = 'Duplicate field value entered';
    error = { ...error, message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors as any).map(val => (val as any).message).join(', ');
    error = { ...error, message, statusCode: 400 };
  }
  
  if (err.message === 'DEVICE_LIMIT_REACHED') {
    error = { ...error, code: 'DEVICE_LIMIT_REACHED', message: 'Maximum device limit reached', statusCode: 403 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || 'SERVER_ERROR',
      message: error.message || 'Server Error',
    },
  });
};
