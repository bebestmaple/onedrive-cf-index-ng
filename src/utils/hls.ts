import Hls, { ErrorData, HlsConfig as HlsJsConfig } from 'hls.js'
import { needsProxy } from './url'

interface CustomHlsConfig extends HlsJsConfig {
  loader: any
  hls?: Hls
}

/**
 * 创建 HLS 实例
 * @param setError 错误处理函数
 * @returns HLS 实例
 */
export const createHlsInstance = (setError: (error: string) => void) => {
  return new Hls({
    debug: false,
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
    drmSystemOptions: {
      'com.apple.fps.1_0': {
        licenseUrl: '',
        certificateUrl: '',
        processLicense: (licenseData: ArrayBuffer) => licenseData,
        processCertificate: (certificateData: ArrayBuffer) => certificateData
      },
      'com.widevine.alpha': {
        licenseUrl: '',
        certificateUrl: '',
        processLicense: (licenseData: ArrayBuffer) => licenseData,
        processCertificate: (certificateData: ArrayBuffer) => certificateData
      },
      'com.microsoft.playready': {
        licenseUrl: '',
        certificateUrl: '',
        processLicense: (licenseData: ArrayBuffer) => licenseData,
        processCertificate: (certificateData: ArrayBuffer) => certificateData
      }
    } as any,
    loader: class CustomLoader extends Hls.DefaultConfig.loader {
      private hlsInstance: Hls | null = null

      constructor(config: CustomHlsConfig) {
        super(config)
        this.hlsInstance = config.hls || null
        this.load = (context: any, config: any, callbacks: any) => {
          const url = context.url
          const currentOrigin = window.location.origin
          
          const requiresProxy = needsProxy(url, currentOrigin)
          if (requiresProxy) {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
            
            const originalLoad = super.load.bind(this)
            this.load = (context: any, config: any, callbacks: any) => {
              const originalUrl = context.url
              const originalResponseType = context.responseType
              
              context.url = proxyUrl
              context.responseType = originalResponseType
              
              if (!context.headers) {
                context.headers = {}
              }
              
              context.headers['X-Original-URL'] = originalUrl
              context.headers['Access-Control-Allow-Origin'] = '*'
              context.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
              context.headers['Access-Control-Allow-Headers'] = 'Origin, Content-Type, Accept, Range'
              
              if (context.frag) {
                if (context.frag.encrypted && context.frag._decryptdata?.method === 'AES-128') {
                  if (context.frag._decryptdata.uri === originalUrl) {
                    context.responseType = 'arraybuffer'
                    context.headers['Accept'] = 'application/octet-stream'
                    context.headers['Cache-Control'] = 'no-cache'
                    context.headers['Pragma'] = 'no-cache'

                    const originalDecryptData = { ...context.frag._decryptdata }
                    const onSuccessCallback = callbacks.onSuccess
                    callbacks.onSuccess = (response: any, stats: any, context: any, networkDetails: any) => {
                      if (response.data) {
                        const keyData = new Uint8Array(response.data)
                        if (context.frag._decryptdata) {
                          context.frag._decryptdata.key = keyData
                        }
                      }
                      
                      context.frag._decryptdata = originalDecryptData
                      
                      if (onSuccessCallback) {
                        onSuccessCallback(response, stats, context, networkDetails)
                      }
                    }
                    
                    callbacks.onError = (error: any, context: any, networkDetails: any) => {
                      if (callbacks.onError) {
                        callbacks.onError(error, context, networkDetails)
                      }
                    }
                  }
                }
                
                if (context.frag.drm) {
                  context.responseType = 'arraybuffer'
                  context.headers['Accept'] = 'application/octet-stream'
                }
              }
              
              return originalLoad(context, config, callbacks)
            }
            
            return this.load(context, config, callbacks)
          }
          
          return super.load(context, config, callbacks)
        }
      }
    }
  } as CustomHlsConfig)
}

const handlePlaybackError = (video: HTMLVideoElement, error: Error, setError: (error: string) => void) => {
  if (error.name === 'AbortError') {
    setTimeout(() => video.play(), 1000)
  } else {
    setError(`播放失败: ${error.message}`)
  }
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
  try {
    if (Hls.isSupported()) {
      const hls = createHlsInstance(setError)
      
      hls.on(Hls.Events.ERROR, (event, data: ErrorData) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && 
                  data.response?.code === 0) {
                setError('跨域访问被阻止，请检查服务器CORS配置')
                return
              }
              setError('网络错误，无法加载视频流')
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('媒体错误，视频格式可能不正确')
              hls.recoverMediaError()
              break
            default:
              setError(`播放错误: ${data.details}`)
              break
          }
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsHlsInitialized(true)
      })

      hls.loadSource(videoUrl)
      hls.attachMedia(video)

      return hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl
      setIsHlsInitialized(true)
    } else {
      setError('您的浏览器不支持HLS播放')
    }
  } catch (err) {
    setError(`无法加载视频: ${err instanceof Error ? err.message : String(err)}`)
    setIsHlsInitialized(true)
  }
  return null
} 