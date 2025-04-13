import { NextRequest } from 'next/server'
import axios from 'axios'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  const url = req.nextUrl.searchParams.get('url')

  if (!url) {
    return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    // 获取原始响应的headers
    const headers = new Headers()
    Object.entries(response.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value.toString())
      }
    })

    // 设置缓存控制和CORS头
    headers.set('Cache-Control', 'public, max-age=31536000')
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')

    // 创建响应
    return new Response(response.data, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch resource' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
} 