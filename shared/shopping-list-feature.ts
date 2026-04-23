/** Avatar skill that gates `/shopping` and shopping-list exports (see docs/SHOPPING_LIST_FEATURE.md). */
export const DENDRITIC_SHOPPING_LIST_SKILL_KEY = "dendritic-shopping-list";

export type ShoppingListSkillNodeLike = {
  skillKey: string;
  currentLevel: number;
};

export function computeShoppingListUnlocked(nodes: ShoppingListSkillNodeLike[]): boolean {
  return nodes.some((n) => n.skillKey === DENDRITIC_SHOPPING_LIST_SKILL_KEY && n.currentLevel > 0);
}
