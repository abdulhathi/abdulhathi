import { z } from 'zod';

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Task = {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  dueDate: string | null; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
};

// Schemas describe what clients may send. They validate at run time and give
// us the matching TypeScript types for free.
const title = z.string().trim().min(1, 'Title is required').max(200);
const dueDate = z.iso.date().nullable();

export const CreateTaskInput = z.strictObject({
  title,
  priority: z.enum(PRIORITIES).default('medium'),
  dueDate: dueDate.optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = z
  .strictObject({
    title: title.optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueDate: dueDate.optional(),
    done: z.boolean().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Send at least one field to change');
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

// Query strings are always text, so numbers and booleans must be converted.
export const ListTasksQuery = z.object({
  done: z.stringbool().optional(),
  priority: z.enum(PRIORITIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuery>;

export const TaskParams = z.object({ id: z.uuid() });

export type TaskPage = { items: Task[]; total: number; limit: number; offset: number };
