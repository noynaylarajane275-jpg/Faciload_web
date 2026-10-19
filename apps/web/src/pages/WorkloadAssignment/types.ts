import { z } from 'zod';
import type { WorkloadAssignment } from '../../lib/workload-assignments';

export const SELECT_MSG = 'Select a valid option';
const uuidSchema = z.string().uuid(SELECT_MSG);

export const createSchema = z.object({
  faculty_id: uuidSchema,
  subject_id: uuidSchema,
  section_id: uuidSchema,
  term_id: uuidSchema,
});

export const editSchema = z.object({
  subject_id: uuidSchema,
  section_id: uuidSchema,
});

export interface FormValues {
  faculty_id: string;
  subject_id: string;
  section_id: string;
  term_id: string;
}

export type FormField = keyof FormValues;

export interface ModalState {
  mode: 'create' | 'edit' | 'closed';
  assignment: WorkloadAssignment | null;
}

export const EMPTY_FORM: FormValues = { faculty_id: '', subject_id: '', section_id: '', term_id: '' };
export const PAGE_SIZE = 10;
export const SEARCH_DEBOUNCE_MS = 300;

