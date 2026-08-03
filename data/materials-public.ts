import type { Material } from "../lib/material-types";

const builtIn = (
  id: string,
  route: Material["route"],
  manager: string,
  title: string,
  materialDate: string,
  strategy: string,
  summary: string,
  tags: string[],
  highlights: string[] = [],
  risks: string[] = [],
): Material => ({
  id, route, manager, title, materialDate, strategy, summary, tags, highlights, risks,
  materialType: route === "due-diligence" ? "尽调报告" : "路演材料",
  status: "已发布", sourceType: "built-in",
});

export const builtInMaterials: Material[] = [
  builtIn("built-in-anzi", "due-diligence", "深圳安子私募基金", "深圳安子私募基金量化股票策略尽调报告", "2025-11", "量化股票策略", "安子当前管理规模约26亿元，以多套低相关子策略组合构建指数增强、市场中性和量化多头产品。", ["量化股票", "指数增强", "市场中性", "高频"], ["实盘运行多套子策略，组合通过优化器进行风险调整。", "产品覆盖指数增强、市场中性和量化多头。"], ["高换手策略对流动性、交易成本和执行稳定性较敏感。", "核心投研团队的关键人依赖需要持续跟踪。"]),
  builtIn("built-in-pingfan", "manager-materials", "北京平凡私募基金", "平凡量化投资业务全析", "2026-06-02", "统计套利与指数增强", "北京平凡产品覆盖统计套利、折价资产套利和指数增强，并自研投研、交易与风控系统。", ["统计套利", "折价资产", "指数增强", "自研系统"], ["采用中心化研究支持与多PM协作框架。", "策略覆盖ETF、折价资产和可转债等方向。"], ["历史业绩和规模为管理人材料口径，仍需核验。"]),
  builtIn("built-in-rongshuhai", "manager-materials", "榕树海私募基金", "榕树海量化股票策略", "2026-07-13", "量化股票", "榕树海采用统一股票模型与组合优化器，覆盖指数增强、量化选股、市场中性和股票多空。", ["量化股票", "指数增强", "市场中性", "机器学习"], ["研究框架以量价数据为主，并通过统一优化器控制行业和风格暴露。"], ["部分业绩来自合作账户或回测，需要分段核验。", "策略换手较高，对交易成本和容量较敏感。"]),
  builtIn("built-in-fuying", "manager-materials", "杭州孚盈投资", "孚盈投资主观CTA策略简介 - 管理人名片", "2026-05-22", "主观CTA", "孚盈采用多基金经理协作的主观CTA框架，强调产业研究与交易经验结合。", ["主观CTA", "产业研究", "管理人名片"], ["团队具备产业链研究与期货交易复合背景。"], ["投研决策的关键人集中度较高。"]),
  builtIn("built-in-longhang", "manager-materials", "龙航资产", "主观管理人系列名片：龙航资产 - 价值成长践行者", "2026-05-23", "主观多头", "龙航聚焦基本面研究、精选个股与长期持有，覆盖科技、医药、消费和制造等行业。", ["主观多头", "价值成长", "基本面研究"], ["以基本面深度研究为核心，强调价值成长与长期复利。"], ["成长风格在估值收缩阶段可能承受较高波动。"]),
  builtIn("built-in-geru", "manager-materials", "上海歌汝私募基金", "主观管理人系列名片：歌汝私募基金", "2026-06-01", "主观多头", "歌汝定位为成长股投资管理人，强调赛道研究、成长弹性与龙头选择。", ["主观多头", "成长股", "产业研究"], ["投研资源配置较充足。"], ["成长赛道暴露可能带来风格集中和估值波动风险。"]),
  builtIn("built-in-yangshi", "manager-materials", "待复核来源机构", "杨湜多策略产品介绍", "2025-07-10", "多策略", "待人工整理", ["多策略", "待复核"]),
  builtIn("built-in-smart-beta", "due-diligence", "待复核来源机构", "SmartBeta策略研究系列：价值风格指数，策略差异解构与配置价值", "2026-07-26", "Smart Beta", "待人工整理", ["Smart Beta", "价值风格", "待复核"]),
  builtIn("built-in-convertible", "manager-materials", "待复核来源机构", "量化分析报告：权益急跌中的转债韧性及估值代价", "2026-07-27", "可转债量化", "待人工整理", ["可转债", "量化分析", "待复核"]),
  builtIn("built-in-zeyuan-2026-midyear", "manager-materials", "泽元投资", "泽元投资2026年中期回顾与前瞻", "2026-07-31", "价值投资", "待人工整理", ["价值投资", "中期回顾", "市场展望", "待人工整理"]),
  builtIn("built-in-youmeili-2026-07", "manager-materials", "优美利", "优美利 最新纪要+QA（26.07）", "2026-07-30", "多策略", "待人工整理", ["多策略", "路演纪要", "QA", "待人工整理"]),
];
