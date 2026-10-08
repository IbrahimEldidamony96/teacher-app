export class ClassroomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ClassroomError";
    this.status = status;
  }
}

export function classroomAssert(condition, message, status = 400) {
  if (!condition) throw new ClassroomError(message, status);
}
