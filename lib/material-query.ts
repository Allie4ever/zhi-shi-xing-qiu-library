import type { Material } from "./material-types";

export function parseMaterialDate(value: string | undefined): { timestamp: number; month: number; year: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { timestamp: date.getTime(), month, year };
}

export function compareMaterialsNewestFirst(left: Material, right: Material) {
  const leftDate = parseMaterialDate(left.materialDate);
  const rightDate = parseMaterialDate(right.materialDate);
  if (!leftDate && !rightDate) return left.id.localeCompare(right.id);
  if (!leftDate) return 1;
  if (!rightDate) return -1;
  return rightDate.timestamp - leftDate.timestamp || left.id.localeCompare(right.id);
}

export function materialMatchesPeriod(material: Material, selectedYear: string, selectedMonth: string) {
  if (!selectedYear && !selectedMonth) return true;
  const parsed = parseMaterialDate(material.materialDate);
  if (!parsed) return false;
  return (!selectedYear || parsed.year === Number(selectedYear)) && (!selectedMonth || parsed.month === Number(selectedMonth));
}

export function filterAndSortMaterials(materials: Material[], options: {
  route: Material["route"];
  status: Material["status"] | "全部";
  query: string;
  selectedYear: string;
  selectedMonth: string;
}) {
  const needle = options.query.trim().toLowerCase();
  return materials
    .filter((material) => {
      if (material.route !== options.route) return false;
      if (options.status !== "全部" && material.status !== options.status) return false;
      const searchable = [material.manager, material.strategy, ...material.tags].join(" ").toLowerCase();
      return searchable.includes(needle) && materialMatchesPeriod(material, options.selectedYear, options.selectedMonth);
    })
    .sort(compareMaterialsNewestFirst);
}
