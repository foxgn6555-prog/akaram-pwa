/** Query Keys — المستخدمون المنصة (البوابة التقنية) */
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (searchQuery?: string) => [...usersKeys.lists(), searchQuery ?? ''] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
}
