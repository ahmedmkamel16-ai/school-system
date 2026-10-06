import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export interface CurriculumRequirement {
  id: number
  grade_level: string
  subject_id: number
  periods_per_week: number
  subject_name: string | null
}

export interface CurriculumRequirementInput {
  grade_level: string
  subject_id: number
  periods_per_week: number
}

export function useCurriculum(gradeLevel?: string) {
  return useQuery({
    queryKey: ['curriculum', gradeLevel],
    queryFn: async () => {
      const { data } = await apiClient.get<CurriculumRequirement[]>('/curriculum', {
        params: gradeLevel ? { grade_level: gradeLevel } : undefined,
      })
      return data
    },
  })
}

export function useUpsertCurriculum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CurriculumRequirementInput) => {
      const { data } = await apiClient.post<CurriculumRequirement>('/curriculum', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curriculum'] })
    },
  })
}

export function useDeleteCurriculum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/curriculum/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curriculum'] })
    },
  })
}
