import { z } from 'zod'

/** Частковий PATCH — кожен перемикач зберігається одразу при зміні
 * (frontend шле лише те поле, яке щойно клацнули), тож усі поля
 * опціональні, як і в updateMeSchema. */
export const updateNotificationSettingsSchema = z
  .object({
    newEventsEnabled: z.boolean().optional(),
    joinConfirmationEnabled: z.boolean().optional(),
    organizerJoinEnabled: z.boolean().optional(),
    // Стосується лише адмінів (розсилка сама відсіює решту через
    // admin_users), але поле доступне будь-кому — так само, як і решта
    // цього ресурсу: не над-інженеримо окремою перевіркою ролі заради
    // перемикача, який для не-адміна просто нічого не робить.
    newRegistrationsEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Немає що оновлювати',
  })

export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>
