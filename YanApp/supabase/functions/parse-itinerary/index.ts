// 言 · 订单识别 Edge Function
// 收订单/机票/酒店截图 → Claude vision 读成结构化行程段 → 返回给客户端确认后入库。
// 部署:
//   supabase functions deploy parse-itinerary
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// 说明:key 只存在服务端(Supabase secrets),App 包里没有 key。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 让模型把订单读成这个结构(和 App 里的 leg 对齐)
const SYSTEM = `你是旅行订单解析器。用户会给你机票、火车票、酒店确认单或行程截图。
把其中每一段行程抽成结构化 JSON。只输出 JSON,不要任何解释文字。

规则:
- 每一段行程一个对象,按时间先后排序。
- mon 用三字母大写英文月份(JAN/FEB/.../DEC),day 是日期数字字符串。
- title:简短,如 "Dublin → Galway" 或 "入住 The Flint"。
- summary:一句话摘要。
- detail:把航班号/车次/时间/地址/确认号等原样保留,多行用 \\n 分隔。
- family:从 flight/transit/hotel/dining/sights 里选最贴切的一个;酒店入住用 hotel,航班用 flight,火车/大巴用 transit。
- 读不出的字段留空字符串,不要编造。
输出形如:{"legs":[{"mon":"JUL","day":"16","title":"...","summary":"...","detail":"...","family":"transit"}]}`;

async function callClaude(images: string[]): Promise<any> {
  const content: any[] = images.map((data) => {
    const m = data.match(/^data:(image\/\w+);base64,(.*)$/);
    return {
      type: "image",
      source: { type: "base64", media_type: m ? m[1] : "image/jpeg", data: m ? m[2] : data },
    };
  });
  content.push({ type: "text", text: "把这些订单里的行程解析成 JSON。" });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          legs: { type: "array", items: {
            type: "object",
            additionalProperties: false,
            properties: {
              mon: { type: "string" }, day: { type: "string" },
              title: { type: "string" }, summary: { type: "string" },
              detail: { type: "string" }, family: { type: "string" },
            },
            required: ["mon", "day", "title", "summary", "detail", "family"],
          } },
        },
        required: ["legs"],
      } } },
      messages: [{ role: "user", content }],
    }),
  });
  if (!resp.ok) throw new Error(`claude ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const json = await resp.json();
  const text = (json.content || []).find((b: any) => b.type === "text")?.text || "{}";
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!ANTHROPIC_API_KEY) throw new Error("服务端没配置 ANTHROPIC_API_KEY");
    // 校验调用方是已登录的 Supabase 用户(挡住匿名滥用)
    const auth = req.headers.get("Authorization") || "";
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "需要登录" }), { status: 401, headers: { ...cors, "content-type": "application/json" } });
    }
    const { images } = await req.json();
    if (!Array.isArray(images) || !images.length) throw new Error("没有图片");
    const out = await callClaude(images.slice(0, 4)); // 一次最多 4 张
    return new Response(JSON.stringify(out), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 400, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
