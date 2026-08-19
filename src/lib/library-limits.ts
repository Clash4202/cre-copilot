// Length caps for the `libraries` / `library_sections` name and description columns. Shared by
// createLibrary/createSection and by the inbox confirm step, which creates exactly the same rows
// from AI-proposed names — a document engineered to steer the model into emitting a very long
// section name must not slip past a cap the manual form enforces. They live in a plain module
// rather than in either action file because a 'use server' module may only export async functions.
export const MAX_NAME_CHARS = 200
export const MAX_DESCRIPTION_CHARS = 500
