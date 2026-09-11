import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PostgrestError } from "@supabase/supabase-js";

export function throwDatabaseError(error: PostgrestError, fallback = "The database operation failed"): never {
  const message = error.message || fallback;
  if (error.code === "PGRST116" || message.includes("NOT_FOUND")) throw new NotFoundException(message);
  if (error.code === "42501" || message.includes("FORBIDDEN")) throw new ForbiddenException(message);
  if (error.code === "23505" || message.includes("UNAVAILABLE")) throw new ConflictException(message);
  throw new BadRequestException({ code: error.code, message });
}

export function requireData<T>(data: T | null, error: PostgrestError | null, notFoundMessage: string): T {
  if (error) throwDatabaseError(error);
  if (data === null) throw new NotFoundException(notFoundMessage);
  return data;
}
