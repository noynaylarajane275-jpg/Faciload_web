import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not forward async rejections; wrap async route handlers so
 * errors reach the central error handler via next(err).
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}