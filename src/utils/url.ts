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
      return new URL(urlWithProtocol).origin !== currentOrigin
    }
    
    // 2. 处理带协议的绝对 URL
    if (url.match(/^[a-z][a-z0-9+.-]*:\/\//i)) {
      return new URL(url).origin !== currentOrigin
    }
    
    // 3. 处理各种相对路径
    // a) 站点根目录相对路径 (/path)
    if (url.startsWith('/') && !url.startsWith('//')) {
      return false
    }
    
    // b) 当前目录相对路径 (./path 或 path)
    if (url.startsWith('./') || !url.includes('/')) {
      return false
    }
    
    // c) 上级目录相对路径 (../path)
    if (url.startsWith('../')) {
      return false
    }
    
    // 4. 其他情况的相对路径
    return false
    
  } catch (e: unknown) {
    // URL 解析失败时的处理
    // 保守起见，遇到无法解析的 URL 就使用代理
    return true
  }
} 