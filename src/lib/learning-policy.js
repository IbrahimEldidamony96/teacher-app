export class LearningError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "LearningError";
    this.status = status;
  }
}

export function learningAssert(condition, message, status = 400) {
  if (!condition) throw new LearningError(message, status);
}

export const HOMEWORK_FILE_LIMIT = 10 * 1024 * 1024;
export const HOMEWORK_BODY_LIMIT = 10_000;
export const HOMEWORK_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function homeworkState(homework, today, submission = null, result = null) {
  if (result) return "CHECKED";
  if (submission) return "SUBMITTED";
  return homework.dueDate.toISOString().slice(0, 10) < today ? "OVERDUE" : "PENDING";
}
