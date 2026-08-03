import assert from "node:assert/strict";
import test from "node:test";
import { compareMaterialsNewestFirst, filterAndSortMaterials, materialMatchesPeriod, parseMaterialDate } from "../lib/material-query.ts";

const material = (id, route, date, manager = "测试管理人", strategy = "量化股票") => ({
  id, route, manager, title: id, materialDate: date, materialType: "测试", strategy,
  summary: "", highlights: [], risks: [], tags: [strategy], status: "已发布", sourceType: "built-in",
});

const fixtures = [
  material("due-new", "due-diligence", "2026-07-31"),
  material("due-old", "due-diligence", "2025-12-15"),
  material("due-invalid", "due-diligence", "日期待补充"),
  material("road-new", "manager-materials", "2026-08-01", "榕树海", "指数增强"),
  material("road-old", "manager-materials", "2025-11-30", "平凡", "统计套利"),
];

test("两个Tab都按完整日期从新到旧排列，无效日期在末尾", () => {
  assert.deepEqual(filterAndSortMaterials(fixtures, { route: "due-diligence", status: "全部", query: "", selectedYear: "", selectedMonth: "" }).map((item) => item.id), ["due-new", "due-old", "due-invalid"]);
  assert.deepEqual(filterAndSortMaterials(fixtures, { route: "manager-materials", status: "全部", query: "", selectedYear: "", selectedMonth: "" }).map((item) => item.id), ["road-new", "road-old"]);
  assert.ok(compareMaterialsNewestFirst(fixtures[0], fixtures[2]) < 0);
  assert.equal(parseMaterialDate("2026-02-30"), null);
});

test("搜索与单个年月筛选叠加，不混入其他年份的同月材料", () => {
  const julyAcrossYears = [
    material("july-2026", "manager-materials", "2026-07-31", "榕树海", "指数增强"),
    material("july-2025", "manager-materials", "2025-07-01", "平凡", "统计套利"),
    material("august", "manager-materials", "2026-08-01", "榕树海", "指数增强"),
  ];
  const result = filterAndSortMaterials(julyAcrossYears, { route: "manager-materials", status: "全部", query: "增强", selectedYear: "2026", selectedMonth: "7" });
  assert.deepEqual(result.map((item) => item.id), ["july-2026"]);
  assert.equal(materialMatchesPeriod(julyAcrossYears[0], "2026", "7"), true);
  assert.equal(materialMatchesPeriod(julyAcrossYears[1], "2026", "7"), false);
  assert.equal(materialMatchesPeriod(julyAcrossYears[2], "2026", "7"), false);
  assert.equal(materialMatchesPeriod(julyAcrossYears[0], "", "7"), true);
  assert.equal(materialMatchesPeriod(julyAcrossYears[1], "", "7"), true);
});
