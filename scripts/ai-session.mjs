function keyMask(key) {
  if (!key) return "";
  return key.length > 8 ? `${key.slice(0, 3)}••••••${key.slice(-4)}` : "••••••••";
}

export function normalizeAiSettings(payload) {
  const provider = String(payload.provider || "openai-compatible").trim();
  if (provider !== "openai-compatible") throw new Error("暂不支持该API服务商");
  const baseUrl = String(payload.baseUrl || "").trim().replace(/\/+$/, "");
  const model = String(payload.model || "").trim();
  const apiKey = String(payload.apiKey || "").trim();
  if (!baseUrl || !model || !apiKey) throw new Error("请完整填写API地址、API Key和模型名称");
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("API地址必须是有效的HTTP或HTTPS地址，且不能包含凭据");
  }
  if (model.length > 120 || apiKey.length > 500) throw new Error("AI设置字段长度不合法");
  return { provider, baseUrl, model, apiKey };
}

export function createAiSessionStore() {
  let session = null;
  return {
    save(payload) {
      session = normalizeAiSettings(payload);
      return this.publicSettings();
    },
    clear() {
      session = null;
      return this.publicSettings();
    },
    get() {
      return session;
    },
    publicSettings() {
      return session
        ? {
            configured: true,
            provider: session.provider,
            baseUrl: session.baseUrl,
            model: session.model,
            keyMask: keyMask(session.apiKey),
          }
        : { configured: false, provider: "openai-compatible", baseUrl: "", model: "", keyMask: "" };
    },
  };
}
