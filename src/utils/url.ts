/**
 * 判断 URL 是否需要代理
 * @param url 要检查的 URL
 * @param currentOrigin 当前页面的 origin
 * @returns 是否需要代理
 */
export const needsProxy = (url: string, currentOrigin: string): boolean => {
  try {
    // 0. 处理数据 URL
    if (url.startsWith('data:')) {
      return false
    }
    
    // 1. 处理协议相对 URL (以 // 开头)
    if (url.startsWith('//')) {
      const urlWithProtocol = `${window.location.protocol}${url}`
      const needsProxy = new URL(urlWithProtocol).origin !== currentOrigin
      console.log('Protocol-relative URL:', {
        original: url,
        withProtocol: urlWithProtocol,
        needsProxy
      })
      return needsProxy
    }
    
    // 2. 处理带协议的绝对 URL
    if (url.match(/^[a-z][a-z0-9+.-]*:\/\//i)) {
      const needsProxy = new URL(url).origin !== currentOrigin
      console.log('Absolute URL:', {
        url,
        needsProxy
      })
      return needsProxy
    }
    
    // 3. 处理各种相对路径
    // a) 站点根目录相对路径 (/path)
    if (url.startsWith('/') && !url.startsWith('//')) {
      console.log('Root-relative path:', url)
      return false
    }
    
    // b) 当前目录相对路径 (./path 或 path)
    if (url.startsWith('./') || !url.includes('/')) {
      console.log('Current directory relative path:', url)
      return false
    }
    
    // c) 上级目录相对路径 (../path)
    if (url.startsWith('../')) {
      console.log('Parent directory relative path:', url)
      return false
    }
    
    // 4. 其他情况的相对路径
    console.log('Other relative path:', url)
    return false
    
  } catch (e: unknown) {
    // URL 解析失败时的处理
    const error = e instanceof Error ? e.message : String(e)
    console.warn('URL parsing failed:', {
      url,
      error,
      type: typeof url,
      length: url.length
    })
    // 保守起见，遇到无法解析的 URL 就使用代理
    return true
  }
} 