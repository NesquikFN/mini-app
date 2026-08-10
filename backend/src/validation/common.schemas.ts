import { z } from 'zod'

/**
 * Zod's built-in .uuid() enforces the RFC 4122 version/variant nibbles,
 * which the seeded dormitories (deterministic ids like
 * 00000000-0000-0000-0000-000000000101 — see
 * database/migrations/0004_dormitories.sql) do not have. A plain
 * 8-4-4-4-12 hex-shape check accepts both real gen_random_uuid() values
 * and the seed ids.
 */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Єдиний валідатор ідентифікаторів. Важливо, що він стоїть ДО звернення
 * до Postgres: колонки id мають тип uuid, і будь-який не-UUID рядок
 * («», «abc», «../../etc/passwd») інакше долітав би до драйвера й падав
 * помилкою 22P02, яку errorHandler показував би як 500.
 */
export function uuidParam(message: string) {
  return z.string().regex(UUID_SHAPE, message)
}

/**
 * Верхня межа для лічильників, що лягають у Postgres `integer`. Без неї
 * значення понад 2147483647 доходить до драйвера й дає «integer out of
 * range» → 500 замість зрозумілої 400.
 */
export const MAX_PG_INTEGER = 2_147_483_647
