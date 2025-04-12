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
}> = ({ videoName, videoUrl, width, height, thumbnail, subtitle, isFlv, isM3u8, mpegts }) => {
  const [error, setError] = useState<string | null>(null)
  const [directUrl, setDirectUrl] = useState<string | null>(null)

  useEffect(() => {
    // Really really hacky way to inject subtitles as file blobs into the video element
    axios
      .get(subtitle, { responseType: 'blob' })
      .then(resp => {
        const track = document.querySelector('track')
        track?.setAttribute('src', URL.createObjectURL(resp.data))
      })
      .catch(() => {
        console.log('Could not load subtitle.')
      })

    if (isFlv) {
      const loadFlv = () => {
        // Really hacky way to get the exposed video element from Plyr
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
        if (!video) return

        try {
          if (Hls.isSupported()) {
            const hls = new Hls({
              debug: true,
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 90
            })
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error('HLS Error:', data)
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    setError('网络错误，无法加载视频流')
                    break
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    setError('媒体错误，视频格式可能不正确')
                    break
                  default:
                    setError('播放错误: ' + data.details)
                    break
                }
              }
            })

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log('HLS manifest parsed successfully')
            })

            hls.loadSource(videoUrl)
            hls.attachMedia(video)
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl
          } else {
            setError('您的浏览器不支持HLS播放')
          }
        } catch (err) {
          console.error('Failed to load HLS:', err)
          setError('无法加载视频: ' + (err instanceof Error ? err.message : String(err)))
        }
      }
      loadHls()
    }
  }, [videoUrl, isFlv, isM3u8, mpegts, subtitle])

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
    controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
    blankVideo: ''
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
        {directUrl && (
          <p className="mt-2 text-xs break-all">
            视频地址: {directUrl}
          </p>
        )}
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
    error,
    result: mpegts,
  } = useAsync(async () => {
    if (isFlv) {
      return (await import('mpegts.js')).default
    }
  }, [isFlv])

  return (
    <>
      <CustomEmbedLinkMenu path={asPath} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <PreviewContainer>
        {error ? (
          <FourOhFour errorMsg={error.message} />
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
