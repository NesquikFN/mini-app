import { dormitoriesRepository } from '../repositories/dormitories.repository'
import type { Dormitory } from '../types/dormitory'

export async function listDormitories(): Promise<Dormitory[]> {
  return dormitoriesRepository.findAll()
}
