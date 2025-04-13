import type { OdFileObject } from '../../types'
import type { LoaderConfig, LoaderContext, LoaderCallbacks, Fragment, DRMSystemOptions } from 'hls.js'

import { FC, useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import axios from 'axios'
import toast from 'react-hot-toast'
import Plyr from 'plyr-react'
import { useAsync } from 'react-async-hook'
import { useClipboard } from 'use-clipboard-copy'
import Hls from 'hls.js'

import { getBaseUrl } from '../../utils/getBaseUrl'
import { getExtension } from '../../utils/getFileIcon'
import { getStoredToken } from '../../utils/protectedRouteHandler'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import CustomEmbedLinkMenu from '../CustomEmbedLinkMenu'

import 'plyr-react/plyr.css'

// 添加HLS事件监听器的公共方法
const setupHlsEventListeners = (hls: Hls, setError: (error: string) => void) => {
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
          setError('播放错误: ' + data.details)
          break
      }
    }
  })
}

// 添加视频元素事件监听器的公共方法
const setupVideoEventListeners = (video: HTMLVideoElement, hls: Hls) => {
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

// 创建HLS实例的公共方法
const createHlsInstance = (setError: (error: string) => void) => {
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
    // 添加完整的加密流支持
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
          
          // 判断是否需要代理的辅助函数
          const needsProxy = (url: string): boolean => {
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
          
          const requiresProxy = needsProxy(url)
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
                // 处理密钥文件
                if (context.frag.encrypted) {
                  context.responseType = 'arraybuffer'
                  context.headers['Accept'] = 'application/octet-stream'
                  console.log('Loading encrypted fragment:', {
                    url: originalUrl,
                    type: context.frag.encrypted ? 'encrypted' : 'clear',
                    keyFormat: context.frag.keyFormat,
                    keyMethod: context.frag.keyMethod
                  })
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

// 初始化HLS播放器的公共方法
const initializeHlsPlayer = async (
  video: HTMLVideoElement,
  videoUrl: string,
  setError: (error: string) => void,
  setIsHlsInitialized: (value: boolean) => void
) => {
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
            setError('播放失败: ' + err.message)
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
        setError('原生HLS播放失败: ' + err.message)
      })
      setIsHlsInitialized(true)
    } else {
      console.error('HLS not supported')
      setError('您的浏览器不支持HLS播放')
    }
  } catch (err) {
    console.error('Failed to load HLS:', err)
    setError('无法加载视频: ' + (err instanceof Error ? err.message : String(err)))
    setIsHlsInitialized(true)
  }
  return null
}

const VideoPlayer: FC<{
  videoName: string
  videoUrl: string
  width?: number
  height?: number
  thumbnail: string
  subtitle: string
  isFlv: boolean
  isM3u8: boolean
  mpegts: any
  isHlsInitialized: boolean
  setIsHlsInitialized: (value: boolean) => void
}> = ({ videoName, videoUrl, width, height, thumbnail, subtitle, isFlv, isM3u8, mpegts, isHlsInitialized, setIsHlsInitialized }) => {
  const [error, setError] = useState<string | null>(null)
  const [hlsInstance, setHlsInstance] = useState<Hls | null>(null)

  useEffect(() => {
    // 修改字幕加载逻辑，添加错误处理
    if (subtitle) {
      axios
        .get(subtitle, { responseType: 'blob' })
        .then(resp => {
          const track = document.querySelector('track')
          if (track) {
            track.setAttribute('src', URL.createObjectURL(resp.data))
          }
        })
        .catch((err) => {
          console.log('Could not load subtitle:', err)
          // 不显示错误，因为字幕是可选的
        })
    }

    if (isFlv) {
      const loadFlv = () => {
        const video = document.getElementById('plyr') as HTMLVideoElement | null
        if (video) {
          const flv = mpegts.createPlayer({ url: videoUrl, type: 'flv' })
          flv.attachMediaElement(video)
          flv.load()
        }
      }
      loadFlv()
    } else if (isM3u8) {
      const loadHls = async () => {
        const video = document.getElementById('plyr') as HTMLVideoElement | null
        if (!video) {
          console.error('Video element not found')
          return
        }

        const hls = await initializeHlsPlayer(video, videoUrl, setError, setIsHlsInitialized)
        setHlsInstance(hls)
      }
      loadHls()
    }
  }, [videoUrl, isFlv, isM3u8, mpegts, subtitle, isHlsInitialized, setIsHlsInitialized])

  // 清理HLS实例
  useEffect(() => {
    return () => {
      if (hlsInstance) {
        console.log('Destroying HLS instance')
        hlsInstance.destroy()
      }
    }
  }, [hlsInstance])

  // Common plyr configs, including the video source and plyr options
  const plyrSource = {
    type: 'video',
    title: videoName,
    poster: thumbnail,
    tracks: [{ kind: 'captions', label: videoName, src: '', default: true }],
  }
  const plyrOptions: Plyr.Options = {
    ratio: `${width ?? 16}:${height ?? 9}`,
    fullscreen: { iosNative: true },
  }
  if (!isFlv && !isM3u8) {
    // If the video is not in flv or m3u8 format, we can use the native plyr and add sources directly with the video URL
    plyrSource['sources'] = [{ src: videoUrl }]
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <p>{error}</p>
        <p className="mt-2 text-sm">请检查M3U8文件内容和视频流地址是否正确</p>
        {videoUrl && (
          <p className="mt-2 text-xs break-all">
            视频地址: {videoUrl}
          </p>
        )}
      </div>
    )
  }

  // 如果是M3U8格式且HLS.js未初始化完成，显示加载中
  if (isM3u8 && !isHlsInitialized) {
    return (
      <div className="relative w-full" style={{ paddingTop: `${(height ?? 9) / (width ?? 16) * 100}%` }}>
        <video
          id="plyr"
          className="absolute top-0 left-0 w-full h-full"
          controls
          playsInline
        />
        <div className="flex absolute inset-0 justify-center items-center bg-gray-100 dark:bg-gray-800">
          <div className="text-center">
            <Loading loadingText="正在加载视频..." />
            <p className="mt-2 text-sm text-gray-500">如果加载时间过长，请检查网络连接</p>
          </div>
        </div>
      </div>
    )
  }

  // 对于M3U8格式，使用自定义的video元素而不是Plyr
  if (isM3u8) {
    return (
      <div className="relative w-full" style={{ paddingTop: `${(height ?? 9) / (width ?? 16) * 100}%` }}>
        <video
          id="plyr"
          className="absolute top-0 left-0 w-full h-full"
          controls
          playsInline
        />
      </div>
    )
  }

  return <Plyr id="plyr" source={plyrSource as Plyr.SourceInfo} options={plyrOptions} />
}

const VideoPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)
  const clipboard = useClipboard()

  const [menuOpen, setMenuOpen] = useState(false)
  const [isHlsInitialized, setIsHlsInitialized] = useState(false)
  const [hlsInstance, setHlsInstance] = useState<Hls | null>(null)
  const [error, setError] = useState<string | null>(null)

  // OneDrive generates thumbnails for its video files, we pick the thumbnail with the highest resolution
  const thumbnail = `/api/thumbnail?path=${asPath}&size=large${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We assume subtitle files are beside the video with the same name, only webvtt '.vtt' files are supported
  const vtt = `${asPath.substring(0, asPath.lastIndexOf('.'))}.vtt`
  const subtitle = `/api/raw?path=${vtt}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We also format the raw video file for the in-browser player as well as all other players
  const videoUrl = `/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  const isFlv = getExtension(file.name) === 'flv'
  const isM3u8 = getExtension(file.name) === 'm3u8'
  const {
    loading,
    error: flvError,
    result: mpegts,
  } = useAsync(async () => {
    if (isFlv) {
      return (await import('mpegts.js')).default
    }
  }, [isFlv])

  useEffect(() => {
    if (isM3u8) {
      const loadHls = async () => {
        const video = document.getElementById('plyr') as HTMLVideoElement | null
        if (!video) {
          console.error('Video element not found')
          return
        }

        const hls = await initializeHlsPlayer(video, videoUrl, setError, setIsHlsInitialized)
        setHlsInstance(hls)
      }

      // 使用 setTimeout 确保 DOM 已经渲染
      setTimeout(loadHls, 0)
    }
  }, [isM3u8, videoUrl])

  // 清理HLS实例
  useEffect(() => {
    return () => {
      if (hlsInstance) {
        console.log('Destroying HLS instance')
        hlsInstance.destroy()
      }
    }
  }, [hlsInstance])

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <p>{error}</p>
        <p className="mt-2 text-sm">请检查M3U8文件内容和视频流地址是否正确</p>
      </div>
    )
  }

  return (
    <>
      <CustomEmbedLinkMenu path={asPath} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <PreviewContainer>
        {flvError ? (
          <FourOhFour errorMsg={flvError.message} />
        ) : loading && isFlv ? (
          <Loading loadingText={'Loading FLV extension...'} />
        ) : (
          <VideoPlayer
            videoName={file.name}
            videoUrl={videoUrl}
            width={file.video?.width}
            height={file.video?.height}
            thumbnail={thumbnail}
            subtitle={subtitle}
            isFlv={isFlv}
            isM3u8={isM3u8}
            mpegts={mpegts}
            isHlsInitialized={isHlsInitialized}
            setIsHlsInitialized={setIsHlsInitialized}
          />
        )}
      </PreviewContainer>

      <DownloadBtnContainer>
        <div className="flex flex-wrap gap-2 justify-center">
          <DownloadButton
            onClickCallback={() => window.open(videoUrl)}
            btnColor="blue"
            btnText={'Download'}
            btnIcon="file-download"
          />
          <DownloadButton
            onClickCallback={() => {
              clipboard.copy(`${getBaseUrl()}/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
              toast.success('Copied direct link to clipboard.')
            }}
            btnColor="pink"
            btnText={'Copy direct link'}
            btnIcon="copy"
          />
          <DownloadButton
            onClickCallback={() => setMenuOpen(true)}
            btnColor="teal"
            btnText={'Customise link'}
            btnIcon="pen"
          />

          <DownloadButton
            onClickCallback={() => window.open(`iina://weblink?url=${getBaseUrl()}${videoUrl}`)}
            btnText="IINA"
            btnImage="/players/iina.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`vlc://${getBaseUrl()}${videoUrl}`)}
            btnText="VLC"
            btnImage="/players/vlc.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`potplayer://${getBaseUrl()}${videoUrl}`)}
            btnText="PotPlayer"
            btnImage="/players/potplayer.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`nplayer-http://${window?.location.hostname ?? ''}${videoUrl}`)}
            btnText="nPlayer"
            btnImage="/players/nplayer.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`intent://${getBaseUrl()}${videoUrl}#Intent;type=video/any;package=is.xyz.mpv;scheme=https;end;`)}
            btnText="mpv-android"
            btnImage="/players/mpv-android.png"
          />
        </div>
      </DownloadBtnContainer>
    </>
  )
}

export default VideoPreview
