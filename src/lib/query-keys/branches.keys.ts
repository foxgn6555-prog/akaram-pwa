export const branchesKeys = {
  all: ['branches'] as const,
  lists: () => [...branchesKeys.all, 'list'] as const,
  list: (includeInactive: boolean) => [...branchesKeys.lists(), includeInactive] as const,
}
