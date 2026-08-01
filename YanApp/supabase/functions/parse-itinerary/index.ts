// 言 · 订单识别 Edge Function
// 收订单/机票/酒店截图 → 通义千问 VL 读成结构化行程段 → 返回给客户端确认后入库。
// 部署:
//   supabase functions deploy parse-itinerary
//   supabase secrets set DASHSCOPE_API_KEY=sk-...   (阿里云百炼 API Key)
// 说明:key 只存在服务端(Supabase secrets),App 包里没有 key。
// 备注:OCR 在服务端跑,与用户所在国家无关;用户只连 Supabase。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DASHSCOPE_API_KEY = Deno.env.get("DASHSCOPE_API_KEY") ?? "";
const QWEN_MODEL = Deno.env.get("QWEN_VL_MODEL") ?? "qwen-vl-max";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 小票:只认总额和币种。刻意不去猜「谁点了什么」——那个识别不可靠,
// 而分账的主场景本来就是均分,填对金额就够了。
const SYSTEM_RECEIPT = `你是消费小票解析器。用户会给你餐厅账单、超市小票或收银条。
只输出 JSON,不要任何解释文字。

规则:
- total:实付总额的数字,不带货币符号,如 "43.50"。有小费/服务费的取最终应付那一行。
- currency:三字母货币代码(EUR/GBP/TRY/USD/CNY/KRW/JPY 等)。看货币符号或语言判断,拿不准就留空。
- merchant:店名,简短。读不出留空。
- 只认总额,不要拆分单品,不要猜谁点了什么。
- 任何读不出的字段留空字符串,绝对不要编造数字。
输出形如:{"total":"43.50","currency":"EUR","merchant":"Temple Bar"}`;

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
- 最多输出 12 段。同一张票的往返算两段;重复信息不要拆成多段。
输出形如:{"legs":[{"mon":"JUL","day":"16","title":"...","summary":"...","detail":"...","family":"transit"}]}`;

// 通义千问 VL(阿里云百炼)· OpenAI 兼容接口。images 为 data URL,直接塞 image_url。
async function callQwen(images: string[], kind: string): Promise<any> {
  const receipt = kind === "receipt";
  const content: any[] = images.map((data) => ({
    type: "image_url",
    image_url: { url: data },
  }));
  content.push({
    type: "text",
    text: receipt ? "读出这张小票的总额和币种,只输出 JSON。" : "把这些订单里的行程解析成 JSON。只输出 JSON。",
  });

  const resp = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        // 真实截图文字多,模型要输出的行程段也多。2048 会把 JSON 从中间截断,
        // 客户端拿到残缺 JSON 直接 parse 失败 —— 表现为「识别不了,退回原页面」。
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: receipt ? SYSTEM_RECEIPT : SYSTEM },
          { role: "user", content },
        ],
      }),
    },
  );
  if (!resp.ok) throw new Error(`qwen ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const json = await resp.json();
  const text = json.choices?.[0]?.message?.content || "{}";
  // 兼容模型偶尔用 ```json 包裹
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // 输出被截断时,JSON 从中间断开。与其整单失败,不如把已经完整的对象捞出来 ——
    // 用户宁可拿到 3 段行程再手动补第 4 段,也不想看到「识别不了」。
    const salvaged = salvageObjects(cleaned);
    if (salvaged.length) return { legs: salvaged, truncated: true };
    throw new Error("模型输出被截断且无法修复,请分批上传");
  }
}

// 从残缺 JSON 里逐个抠出「花括号配平」的完整对象。
// 用栈记录每个 { 的位置,每遇到配对的 } 就尝试解析那一段 ——
// 不能只在最外层配平时才捞:行程段套在 {"legs":[...]} 里面,
// 外层被截断时永远等不到它闭合,只看最外层会一段都捞不到。
// 只做括号计数 + 字符串状态机,不引第三方库(Edge Function 要尽量轻)。
function salvageObjects(text: string): any[] {
  const out: any[] = [];
  const stack: number[] = [];
  let inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") stack.push(i);
    else if (c === "}" && stack.length) {
      const start = stack.pop()!;
      try {
        const obj = JSON.parse(text.slice(start, i + 1));
        if (obj && typeof obj === "object" && obj.title) out.push(obj);
      } catch (_) { /* 这一段坏了就跳过 */ }
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!DASHSCOPE_API_KEY) throw new Error("服务端没配置 DASHSCOPE_API_KEY");
    // 校验调用方是已登录的 Supabase 用户(挡住匿名滥用)
    const auth = req.headers.get("Authorization") || "";
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "需要登录" }), { status: 401, headers: { ...cors, "content-type": "application/json" } });
    }
    const { images, kind } = await req.json();
    if (!Array.isArray(images) || !images.length) throw new Error("没有图片");
    // kind: "receipt" 读小票总额;缺省读行程订单
    const out = kind === "receipt"
      ? await callQwen(images.slice(0, 1), "receipt")   // 小票一次一张
      : await callQwen(images.slice(0, 4), "itinerary");
    // 兜底截断:模型偶尔无视「最多 12 段」的约束(比如截图里有几十行重复订单),
    // 一路输出会把耗时拖到一分钟以上。客户端还要逐条确认,给再多也没用。
    if (Array.isArray(out?.legs) && out.legs.length > 12) {
      out.legs = out.legs.slice(0, 12);
      out.capped = true;
    }
    return new Response(JSON.stringify(out), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 400, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
