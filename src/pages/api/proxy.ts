import { NextRequest } from 'next/server'
import axios from 'axios'
import { getAccessToken } from '.'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest): Promise<Response> {
  const accessToken = await getAccessToken()
  const url = req.nextUrl.searchParams.get('url')

  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: 'stream',
    })

    // 获取原始响应的headers
    const headers = new Headers()
    Object.entries(response.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value.toString())
      }
    })

    // 设置缓存控制
    headers.set('Cache-Control', 'public, max-age=31536000')

    // 创建可读流
    const stream = response.data

    // 返回流式响应
    return new Response(stream, {
      status: 200,
      headers,
    })
  } catch (error: any) {
    console.error('Proxy error:', error)
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: error?.response?.status || 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
} 