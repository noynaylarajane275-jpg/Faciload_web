import { z } from 'zod';

// Placeholder: real entity schemas land in Phase 3. This module proves
// Zod is wired in (per Phase 1: "Zod validation wired in").
export const healthQuerySchema = z.object({}).strict();

export type HealthQuery = z.infer<typeof healthQuerySchema>;
