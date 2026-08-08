import { app } from './app'
import { env } from './config/env'
import { startEventReminderScheduler } from './services/event-reminders.service'

app.listen(env.PORT, () => {
  console.log(`DormHub API running on http://localhost:${env.PORT}`)
})

startEventReminderScheduler()
