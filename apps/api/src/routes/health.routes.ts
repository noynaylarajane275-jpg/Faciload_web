import { Router, type Request, type Response } from 'express';
import { healthController } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/health', (req: Request, res: Response) => healthController(req, res));
