import { z } from 'zod'

/** Частковий PATCH — кожен перемикач зберігається одразу при зміні
 * (frontend шле лише те поле, яке щойно клацнули), тож усі поля
 * опціональні, як і в updateMeSchema. */
export const updateNotificationSettingsSchema = z
  .object({
    newEventsEnabled: z.boolean().optional(),
    joinConfirmationEnabled: z.boolean().optional(),
    organizerJoinEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Немає що оновлювати',
  })

export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>
