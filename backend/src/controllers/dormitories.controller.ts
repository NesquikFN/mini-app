import type { Request, Response } from 'express'
import * as dormitoriesService from '../services/dormitories.service'

export async function listDormitories(_req: Request, res: Response): Promise<void> {
  res.json({ dormitories: await dormitoriesService.listDormitories() })
}
