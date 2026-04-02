/**
 * Standalone vocal recorder widget — extracted from VocalsLanding.tsx.
 * Uses MediaRecorder API with AnalyserNode for live waveform visualization.
 */
import { useState, useRef, useCallback, useEffect } from 'react'

export default function VocalsWidget({ accentColor = '#D41113' }: { accentColor?: string }) {
  const [recState, setRecState] = useState<'idle' | 'recording' | 'playing' | 'denied'>('idle')
  const [recProgress, setRecProgress] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recBufferRef = useRef<AudioBuffer | null>(null)
  const recTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartTimeRef = useRef(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(20).fill(4))
  const recAudioCtxRef = useRef<AudioContext | null>(null)

  const getAudioCtx = useCallback(() => {
    if (!recAudioCtxRef.current) recAudioCtxRef.current = new AudioContext()
    if (recAudioCtxRef.current.state === 'suspended') recAudioCtxRef.current.resume()
    return recAudioCtxRef.current
  }, [])

  const updateWaveform = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount)
    const update = () => {
      analyser.getByteFrequencyData(data)
      const step = Math.floor(data.length / 20)
      const heights = Array.from({ length: 20 }, (_, i) => {
        const val = data[i * step] || 0
        return Math.max(4, (val / 255) * 60)
      })
      setWaveHeights(heights)
      animFrameRef.current = requestAnimationFrame(update)
    }
    update()
  }, [])

  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    setWaveHeights(Array(20).fill(4))
  }, [])

  const playbackRecording = useCallback(() => {
    const buf = recBufferRef.current
    if (!buf) return
    const ctx = getAudioCtx()
    const src = ctx.createBufferSource()
    src.buffer = buf
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    analyser.connect(ctx.destination)
    playbackSourceRef.current = src
    setRecState('playing')
    updateWaveform(analyser)
    src.onended = () => { setRecState('idle'); stopWaveform() }
    src.start()
  }, [getAudioCtx, updateWaveform, stopWaveform])

  const stopRecording = useCallback(() => {
    if (recTimeoutRef.current) clearTimeout(recTimeoutRef.current)
    if (recIntervalRef.current) clearInterval(recIntervalRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop()
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    stopWaveform()
  }, [stopWaveform])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = getAudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      updateWaveform(analyser)

      let mimeType = ''
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus'
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stopWaveform()
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' })
        try {
          const arrBuf = await blob.arrayBuffer()
          const audioBuf = await ctx.decodeAudioData(arrBuf)
          recBufferRef.current = audioBuf
          playbackRecording()
        } catch { setRecState('idle') }
      }

      recorder.start()
      setRecState('recording')
      setRecProgress(0)
      recStartTimeRef.current = Date.now()

      recIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - recStartTimeRef.current) / 1000
        setRecProgress(Math.min(elapsed, 3))
      }, 100)

      recTimeoutRef.current = setTimeout(() => stopRecording(), 3000)
    } catch { setRecState('denied') }
  }, [getAudioCtx, updateWaveform, stopWaveform, stopRecording, playbackRecording])

  const handleMicDown = useCallback(() => {
    if (recState === 'playing') {
      if (playbackSourceRef.current) { try { playbackSourceRef.current.stop() } catch {} }
      setRecState('idle'); stopWaveform(); return
    }
    if (recState === 'idle' || recState === 'denied') startRecording()
  }, [recState, startRecording, stopWaveform])

  const handleMicUp = useCallback(() => {
    if (recState === 'recording') stopRecording()
  }, [recState, stopRecording])

  // Cleanup on unmount
  useEffect(() => () => {
    if (recTimeoutRef.current) clearTimeout(recTimeoutRef.current)
    if (recIntervalRef.current) clearInterval(recIntervalRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }, [])

  const ringCircumference = 2 * Math.PI * 60
  const ringOffset = ringCircumference - (recProgress / 3) * ringCircumference

  return (
    <div className="vc-recorder">
      <p style={{ fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 }}>
        Hold the button and sing anything. We'll play it back.
      </p>

      {/* Mic button */}
      <div
        className={`vc-mic-btn${recState === 'recording' ? ' recording' : ''}`}
        onMouseDown={handleMicDown}
        onMouseUp={handleMicUp}
        onTouchStart={handleMicDown}
        onTouchEnd={handleMicUp}
      >
        {recState === 'recording' && (
          <svg className="vc-progress-ring" viewBox="0 0 132 132">
            <circle className="vc-ring-bg" cx="66" cy="66" r="60" />
            <circle className="vc-ring-fg" cx="66" cy="66" r="60"
              strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
              style={{ stroke: accentColor }}
            />
          </svg>
        )}
        {'\u{1F3A4}'}
      </div>

      {/* Status text */}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        {recState === 'idle' && <p style={{ color: '#555', fontSize: 13 }}>Hold to record</p>}
        {recState === 'recording' && <p style={{ color: accentColor, fontSize: 13 }}>Recording... release to play back</p>}
        {recState === 'playing' && <p style={{ color: '#888', fontSize: 13 }}>Playing back...</p>}
        {recState === 'denied' && (
          <p style={{ color: '#D41113', fontSize: 13, cursor: 'pointer' }} onClick={() => { setRecState('idle'); startRecording() }}>
            Microphone access needed — tap here to try again
          </p>
        )}
      </div>

      {/* Waveform visualizer */}
      <div className="vc-waveform">
        {waveHeights.map((h, i) => (
          <div key={i} className="vc-waveform-bar" style={{ height: h }} />
        ))}
      </div>
    </div>
  )
}
