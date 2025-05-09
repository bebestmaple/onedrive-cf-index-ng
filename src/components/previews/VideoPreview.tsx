import type { OdFileObject } from '../../types'

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
import { initializeHlsPlayer } from '../../utils/hls'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import CustomEmbedLinkMenu from '../CustomEmbedLinkMenu'

import 'plyr-react/plyr.css'

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
        .catch(() => {
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
    controls: [
      'play-large',
      'play',
      'progress',
      'current-time',
      'mute',
      'volume',
      'captions',
      'settings',
      'pip',
      'airplay',
      'fullscreen'
    ],
    settings: ['captions', 'quality', 'speed'],
    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
    keyboard: { focused: true, global: true },
    tooltips: { controls: true, seek: true },
    displayDuration: true,
    hideControls: true,
    clickToPlay: true,
    disableContextMenu: false,
    loadSprite: true,
    iconUrl: 'https://cdn.plyr.io/3.7.8/plyr.svg',
    blankVideo: 'https://cdn.plyr.io/static/blank.mp4'
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
