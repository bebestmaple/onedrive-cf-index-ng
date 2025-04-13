import Hls from 'hls.js'
import { needsProxy } from './url'

/**
 * 设置 HLS 事件监听器
 * @param hls HLS 实例
 * @param setError 错误处理函数
 */
export const setupHlsEventListeners = (hls: Hls, setError: (error: string) => void) => {
  const events = [
    Hls.Events.ERROR,
    Hls.Events.MANIFEST_PARSED,
    Hls.Events.MANIFEST_LOADING,
    Hls.Events.MANIFEST_LOADED,
    Hls.Events.LEVEL_LOADED,
    Hls.Events.LEVEL_SWITCHED,
    Hls.Events.FRAG_LOADED,
    Hls.Events.FRAG_PARSED,
    Hls.Events.FRAG_BUFFERED,
    Hls.Events.BUFFER_CREATED,
    Hls.Events.BUFFER_APPENDED,
    Hls.Events.BUFFER_APPENDING,
    Hls.Events.BUFFER_EOS,
    Hls.Events.BUFFER_FLUSHED,
    Hls.Events.LEVEL_UPDATED,
    Hls.Events.LEVEL_SWITCHING,
    Hls.Events.LEVEL_PTS_UPDATED,
    Hls.Events.LEVEL_LOADING,
    Hls.Events.KEY_LOADED,
    Hls.Events.KEY_LOADING,
    Hls.Events.SUBTITLE_TRACKS_UPDATED,
    Hls.Events.SUBTITLE_TRACK_LOADED,
    Hls.Events.SUBTITLE_TRACK_SWITCH,
    Hls.Events.SUBTITLE_FRAG_PROCESSED
  ]

  events.forEach(event => {
    hls.on(event, (eventType: string, data: any) => {
      console.log(`[HLS Event] ${event}:`, {
        eventType,
        data,
        timestamp: new Date().toISOString()
      })
    })
  })

  hls.on(Hls.Events.ERROR, (event, data) => {
    console.error('[HLS Error]', {
      event,
      data,
      timestamp: new Date().toISOString()
    })
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && 
              data.response && data.response.code === 0) {
            setError('跨域访问被阻止，请检查服务器CORS配置')
            return
          }
          setError('网络错误，无法加载视频流，正在重试...')
          let retryCount = 0
          const maxRetries = 3
          const retry = () => {
            if (retryCount < maxRetries) {
              retryCount++
              console.log(`Retry attempt ${retryCount} of ${maxRetries}`)
              setTimeout(() => {
                hls.startLoad()
              }, 1000 * retryCount)
            } else {
              setError('无法加载视频流，请检查网络连接或视频地址是否正确')
            }
          }
          retry()
          break
        case Hls.ErrorTypes.MEDIA_ERROR:
          setError('媒体错误，视频格式可能不正确，正在尝试恢复...')
          hls.recoverMediaError()
          break
        default:
          setError(`播放错误: ${data.details}`)
          break
      }
    }
  })
}

/**
 * 设置视频元素事件监听器
 * @param video 视频元素
 * @param hls HLS 实例
 */
export const setupVideoEventListeners = (video: HTMLVideoElement, hls: Hls) => {
  video.addEventListener('loadedmetadata', () => {
    console.log('Video metadata loaded')
  })
  video.addEventListener('loadeddata', () => {
    console.log('Video data loaded')
  })
  video.addEventListener('canplay', () => {
    console.log('Video can play')
  })
  video.addEventListener('play', () => {
    console.log('Video started playing')
  })
  video.addEventListener('error', (e) => {
    console.error('Video element error:', e)
  })
  video.addEventListener('stalled', () => {
    console.log('Video stalled, trying to recover...')
    hls.startLoad()
  })
  video.addEventListener('waiting', () => {
    console.log('Video waiting for data...')
  })
  video.addEventListener('playing', () => {
    console.log('Video playing')
  })
  video.addEventListener('ended', () => {
    console.log('Video ended')
  })
}

/**
 * 创建 HLS 实例
 * @param setError 错误处理函数
 * @returns HLS 实例
 */
export const createHlsInstance = (setError: (error: string) => void) => {
  return new Hls({
    debug: true,
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 90,
    maxBufferLength: 30,
    maxMaxBufferLength: 600,
    maxBufferSize: 60 * 1000 * 1000,
    maxBufferHole: 0.5,
    startLevel: -1,
    abrEwmaDefaultEstimate: 500000,
    abrBandWidthFactor: 0.95,
    abrBandWidthUpFactor: 0.7,
    abrMaxWithRealBitrate: true,
    testBandwidth: true,
    progressive: true,
    // 优化加密流支持
    drmSystemOptions: {
      // FairPlay Streaming
      'com.apple.fps.1_0': {
        licenseUrl: '',
        certificateUrl: '',
        processLicense: (licenseData: ArrayBuffer) => licenseData,
        processCertificate: (certificateData: ArrayBuffer) => certificateData
      },
      // Widevine
      'com.widevine.alpha': {
        licenseUrl: '',
        certificateUrl: '',
        processLicense: (licenseData: ArrayBuffer) => licenseData,
        processCertificate: (certificateData: ArrayBuffer) => certificateData
      },
      // PlayReady
      'com.microsoft.playready': {
        licenseUrl: '',
        certificateUrl: '',
        processLicense: (licenseData: ArrayBuffer) => licenseData,
        processCertificate: (certificateData: ArrayBuffer) => certificateData
      }
    } as any,
    // 修改加载器配置
    loader: class CustomLoader extends Hls.DefaultConfig.loader {
      constructor(config: any) {
        super(config)
        this.load = (context: any, config: any, callbacks: any) => {
          const url = context.url
          const currentOrigin = window.location.origin
          
          const requiresProxy = needsProxy(url, currentOrigin)
          if (requiresProxy) {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
            console.log('Using proxy:', {
              original: url,
              proxy: proxyUrl,
              type: url.startsWith('//') ? 'protocol-relative' :
                    url.match(/^[a-z]+:\/\//i) ? 'absolute' : 'unknown'
            })
            
            // 修改请求配置，确保正确处理加密视频流
            const originalLoad = super.load.bind(this)
            this.load = (context: any, config: any, callbacks: any) => {
              // 保存原始 URL 和响应类型
              const originalUrl = context.url
              const originalResponseType = context.responseType
              
              // 设置代理 URL
              context.url = proxyUrl
              
              // 确保响应类型正确
              context.responseType = originalResponseType
              
              // 添加必要的头部
              if (!context.headers) {
                context.headers = {}
              }
              
              // 添加原始 URL 作为头部，以便代理服务器知道原始请求
              context.headers['X-Original-URL'] = originalUrl
              
              // 添加 CORS 相关头部
              context.headers['Access-Control-Allow-Origin'] = '*'
              context.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
              context.headers['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept, Range'
              
              // 处理不同类型的加密内容
              if (context.frag) {
                // 处理 AES-128 加密
                if (context.frag.encrypted && context.frag._decryptdata?.method === 'AES-128') {
                  console.log('Processing AES-128 encrypted content:', {
                    url: originalUrl,
                    keyUri: context.frag._decryptdata.uri,
                    iv: context.frag._decryptdata.iv,
                    decryptdata: context.frag._decryptdata
                  })
                  
                  // 如果是密钥文件请求
                  if (context.frag._decryptdata.uri === originalUrl) {
                    context.responseType = 'arraybuffer'
                    context.headers['Accept'] = 'application/octet-stream'
                    context.headers['Cache-Control'] = 'no-cache'
                    context.headers['Pragma'] = 'no-cache'
                    
                    console.log('Loading AES-128 key file:', {
                      url: originalUrl,
                      method: context.frag._decryptdata.method,
                      keyFormat: context.frag._decryptdata.keyFormat,
                      decryptdata: context.frag._decryptdata
                    })

                    // 确保解密数据在密钥加载后保持不变
                    const originalDecryptData = { ...context.frag._decryptdata }
                    callbacks.onSuccess = (response: any, stats: any, context: any, networkDetails: any) => {
                      console.log('Key loaded successfully:', {
                        url: originalUrl,
                        response,
                        stats,
                        originalDecryptData
                      })
                      // 恢复原始解密数据
                      context.frag._decryptdata = originalDecryptData
                      if (callbacks.onSuccess) {
                        callbacks.onSuccess(response, stats, context, networkDetails)
                      }
                    }
                  }
                }
                
                // 处理 DRM 内容
                if (context.frag.drm) {
                  context.responseType = 'arraybuffer'
                  context.headers['Accept'] = 'application/octet-stream'
                  console.log('Loading DRM content:', {
                    url: originalUrl,
                    drmSystem: context.frag.drm.system,
                    drmMethod: context.frag.drm.method
                  })
                }
              }
              
              // 调用原始加载方法
              return originalLoad(context, config, callbacks)
            }
            
            return this.load(context, config, callbacks)
          }
          
          return super.load(context, config, callbacks)
        }
      }
    }
  })
}

/**
 * 初始化 HLS 播放器
 * @param video 视频元素
 * @param videoUrl 视频 URL
 * @param setError 错误处理函数
 * @param setIsHlsInitialized 设置 HLS 初始化状态的函数
 * @returns HLS 实例
 */
export const initializeHlsPlayer = async (
  video: HTMLVideoElement,
  videoUrl: string,
  setError: (error: string) => void,
  setIsHlsInitialized: (value: boolean) => void
): Promise<Hls | null> => {
  console.log('=== HLS Player Initialization ===')
  console.log('Video URL:', videoUrl)
  console.log('Browser HLS Support:', Hls.isSupported())
  console.log('Native HLS Support:', video.canPlayType('application/vnd.apple.mpegurl'))
  console.log('Video Element:', video)

  try {
    if (Hls.isSupported()) {
      console.log('Creating HLS instance...')
      const hls = createHlsInstance(setError)
      
      setupHlsEventListeners(hls, setError)
      setupVideoEventListeners(video, hls)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed successfully')
        setIsHlsInitialized(true)
        // 移除自动播放，让用户手动点击播放
        video.play().catch(err => {
          console.error('Playback failed:', err)
          if (err.name === 'AbortError') {
            console.log('Playback aborted, retrying...')
            setTimeout(() => video.play(), 1000)
          } else {
            setError(`播放失败: ${err.message}`)
          }
        })
      })

      console.log('Loading HLS source...')
      hls.loadSource(videoUrl)
      console.log('Attaching media element...')
      hls.attachMedia(video)
      console.log('HLS initialization completed')

      return hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('Using native HLS support')
      video.src = videoUrl
      video.play().catch(err => {
        console.error('Native HLS playback failed:', err)
        setError(`原生HLS播放失败: ${err.message}`)
      })
      setIsHlsInitialized(true)
    } else {
      console.error('HLS not supported')
      setError('您的浏览器不支持HLS播放')
    }
  } catch (err) {
    console.error('Failed to load HLS:', err)
    setError(`无法加载视频: ${err instanceof Error ? err.message : String(err)}`)
    setIsHlsInitialized(true)
  }
  return null
} 