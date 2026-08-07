import { supabase } from '../config/supabase'
import type { EventTemplate } from '../types/admin'

interface EventTemplateRow {
  id: string
  title: string
  description: string | null
  weekday: number
  time: string
  location: string
  is_online: boolean
  max_participants: number
  group_url: string | null
  image_url: string | null
  dormitory_id: string | null
  created_at: string
  updated_at: string
}

export interface EventTemplateInput {
  title: string
  description: string
  weekday: number
  time: string
  location: string
  isOnline: boolean
  maxParticipants: number
  groupUrl?: string
  dormitoryId?: string
}

function toTemplate(row: EventTemplateRow): EventTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    weekday: row.weekday,
    time: row.time,
    location: row.location,
    isOnline: row.is_online,
    maxParticipants: row.max_participants,
    groupUrl: row.group_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    dormitoryId: row.dormitory_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(input: EventTemplateInput): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description || null,
    weekday: input.weekday,
    time: input.time,
    location: input.location,
    is_online: input.isOnline,
    max_participants: input.maxParticipants,
    group_url: input.groupUrl || null,
    dormitory_id: input.dormitoryId ?? null,
    updated_at: new Date().toISOString(),
  }
}

export const eventTemplatesRepository = {
  async findAll(): Promise<EventTemplate[]> {
    const { data, error } = await supabase
      .from('event_templates')
      .select('*')
      .order('weekday', { ascending: true })
      .order('time', { ascending: true })
      .returns<EventTemplateRow[]>()
    if (error) throw error
    return data.map(toTemplate)
  },

  async findById(id: string): Promise<EventTemplate | null> {
    const { data, error } = await supabase
      .from('event_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle<EventTemplateRow>()
    if (error) throw error
    return data ? toTemplate(data) : null
  },

  async insert(input: EventTemplateInput): Promise<EventTemplate> {
    const { data, error } = await supabase
      .from('event_templates')
      .insert(toRow(input))
      .select('*')
      .single<EventTemplateRow>()
    if (error) throw error
    return toTemplate(data)
  },

  async update(id: string, input: EventTemplateInput): Promise<EventTemplate | null> {
    const { data, error } = await supabase
      .from('event_templates')
      .update(toRow(input))
      .eq('id', id)
      .select('*')
      .maybeSingle<EventTemplateRow>()
    if (error) throw error
    return data ? toTemplate(data) : null
  },

  async updateImage(id: string, imageUrl: string): Promise<EventTemplate | null> {
    const { data, error } = await supabase
      .from('event_templates')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle<EventTemplateRow>()
    if (error) throw error
    return data ? toTemplate(data) : null
  },

  async remove(id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('event_templates')
      .delete()
      .eq('id', id)
      .select('id')
    if (error) throw error
    return (data?.length ?? 0) > 0
  },
}
