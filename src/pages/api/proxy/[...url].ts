import { NextRequest } from 'next/server'
import siteConfig from '../../../../config/site.config.js'

export const config = {
  runtime: 'edge'
}

export default async function handler(req: NextRequest) {
  // 从path中获取完整路径
  const fullPath = req.nextUrl.pathname.replace('/api/proxy/', '')
  
  if (!fullPath) {
    return new Response(JSON.stringify({ error: 'URL is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Range'
      }
    })
  }

  try {
    // 检查是否启用安全代理
    const enableSafeProxy = siteConfig.proxy.enableSafeProxy
    let url: string

    if (enableSafeProxy) {
      // 获取安全路径
      const safePath = siteConfig.proxy.safeProxyPath
      if (!safePath) {
        return new Response(JSON.stringify({ error: 'safeProxyPath is required when enableSafeProxy is true' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }

      // 验证路径前缀
      if (!fullPath.startsWith(safePath)) {
        return new Response(JSON.stringify({ error: 'Invalid proxy path' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }

      // 提取实际的URL
      url = fullPath.slice(safePath.length + 1) // +1 是为了去掉路径分隔符
    } else {
      // 未启用安全代理，直接使用完整路径作为URL
      url = fullPath
    }

    // 解码 URL
    const decodedUrl = decodeURIComponent(url)

    // 获取原始请求的头部
    const originalHeaders: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      originalHeaders[key] = value
    })

    const response = await fetch(decodedUrl, {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        ...originalHeaders
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`)
    }

    // 构建响应头
    const headers = new Headers()
    headers.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream')
    headers.set('Cache-Control', 'public, max-age=31536000')
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept, Range')
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range')
    headers.set('Access-Control-Max-Age', '86400')

    // 复制原始响应的其他头部
    response.headers.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value)
      }
    })

    return new Response(response.body, {
      status: response.status,
      headers
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to proxy request',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Range'
      }
    })
  }
} 