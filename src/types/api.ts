/** Shapes of every API response. Safe to import from browser and server code. */
export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown; requestId: string } }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
