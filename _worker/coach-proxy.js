// Cloudflare Worker: AI 教练 API 代理
// 将 /apps/:id/completion 请求转发到 DashScope，并注入 Authorization 头
//
// 部署步骤：
// 1. 在 https://dash.cloudflare.com 创建一个 Worker
// 2. 把下面的代码粘贴到 Worker 编辑器中
// 3. 在 Worker Settings → Variables and Secrets 中添加：
//    - DASHSCOPE_API_KEY = 你的 COACH_API_KEY（sk-...）
//    - DASHSCOPE_TARGET = DashScope API 目标地址（如 https://dashscope.aliyuncs.com）
// 4. 保存并部署，复制 Worker 的 URL（如 https://dongzhi-coach-api.workers.dev）
// 5. 在 GitHub Repository Settings → Secrets and variables → Actions 中添加：
//    - VITE_COACH_APP_ID = 你的应用 ID
//    - VITE_COACH_API_BASE = https://你的-worker地址.workers.dev
// 6. 推送 main 分支，GitHub Actions 会自动构建并部署
//
// 本地开发时不需要此 Worker，Vite dev server 已内置相同的代理逻辑。

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const key = env.DASHSCOPE_API_KEY;
    if (!key) {
      return jsonError('Worker 未配置 DASHSCOPE_API_KEY 密钥', 500);
    }

    const target = env.DASHSCOPE_TARGET || 'https://dashscope.aliyuncs.com';
    const upstreamUrl = `${target}/api/v1${url.pathname}`;

    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${key}`);
    headers.delete('host');
    headers.delete('origin');
    headers.delete('referer');

    const fetchRequest = new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.body,
      cf: {
        cacheTtl: 0,
      },
    });

    try {
      const response = await fetch(fetchRequest);
      const upstreamHeaders = new Headers(response.headers);
      upstreamHeaders.set('Access-Control-Allow-Origin', '*');
      upstreamHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      upstreamHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      upstreamHeaders.delete('set-cookie');
      return new Response(response.body, {
        status: response.status,
        headers: upstreamHeaders,
      });
    } catch (err) {
      return jsonError(`DashScope 请求失败: ${err.message}`, 502);
    }
  },
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}
