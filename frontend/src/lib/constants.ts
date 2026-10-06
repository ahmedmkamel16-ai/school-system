export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  left_early: 'انصراف مبكر',
}

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
] as const

export const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
}

export const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const

export const TEACHER_STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  on_leave: 'في إجازة',
  inactive: 'غير نشط',
}

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  listener: 'مستمع',
  suspended: 'معلق',
  transferred: 'منقول',
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير',
  teacher: 'معلم',
  accountant: 'محاسب',
  parent: 'ولي أمر',
}

export const GRADE_LEVELS = [
  'الأول الابتدائي',
  'الثاني الابتدائي',
  'الثالث الابتدائي',
  'الرابع الابتدائي',
  'الخامس الابتدائي',
  'السادس الابتدائي',
  'الأول الإعدادي',
  'الثاني الإعدادي',
  'الثالث الإعدادي',
  'الأول الثانوي',
  'الثاني الثانوي',
  'الثالث الثانوي',
] as const
