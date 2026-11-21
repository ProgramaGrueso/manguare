import { useEffect, useRef, useState } from 'react';
import { Mic, PhoneOff, Sparkles, X } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { VOICE_FUNCTION_DECLARATIONS, type VoiceToolHandler } from '../lib/voice-tools';

type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface GeminiLiveToken {
  token?: string;
  model?: string;
  error?: string;
}

export function VoiceAssistant({
  onClose,
  onToolCall,
}: {
  onClose: () => void;
  onToolCall: VoiceToolHandler;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [compact, setCompact] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playbackRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackTimeRef = useRef(0);
  const activeRef = useRef(false);
  const handlerRef = useRef(onToolCall);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const toolAbortControllersRef = useRef(new Map<string, AbortController>());
  const partialTranscriptRef = useRef('');
  const lastUserUtteranceRef = useRef('');

  handlerRef.current = onToolCall;

  const stopPlayback = () => {
    playbackRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // El búfer puede haberse detenido por una interrupción de Gemini.
      }
    });
    playbackRef.current = [];
    playbackTimeRef.current = 0;
  };

  const cleanup = () => {
    activeRef.current = false;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    for (const controller of toolAbortControllersRef.current.values()) controller.abort();
    toolAbortControllersRef.current.clear();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Puede haberse desconectado durante la limpieza del navegador.
      }
      processorRef.current = null;
    }

    try {
      sourceRef.current?.disconnect();
    } catch {
      // Puede haberse desconectado durante la limpieza del navegador.
    }
    sourceRef.current = null;
    try {
      gainRef.current?.disconnect();
    } catch {
      // Puede haberse desconectado durante la limpieza del navegador.
    }
    gainRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopPlayback();

    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        try {
          socket.close();
        } catch {
          // La conexión pudo cerrarse antes de limpiar.
        }
      }
    }

    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
    partialTranscriptRef.current = '';
    lastUserUtteranceRef.current = '';
  };

  useEffect(() => cleanup, []);

  const startAudioInput = () => {
    const context = contextRef.current;
    const stream = streamRef.current;
    const socket = socketRef.current;
    if (!context || !stream || !socket || !activeRef.current) return;

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const gain = context.createGain();
    gain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (socket.readyState !== WebSocket.OPEN || !activeRef.current) return;
      const input = event.inputBuffer.getChannelData(0);
      const ratio = context.sampleRate / 16000;
      const outputLength = Math.floor(input.length / ratio);
      const pcm = new Int16Array(outputLength);
      for (let index = 0; index < outputLength; index++) {
        const sample = Math.max(-1, Math.min(1, input[Math.floor(index * ratio)] ?? 0));
        pcm[index] = sample < 0 ? sample * 32768 : sample * 32767;
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index++) {
        binary += String.fromCharCode(bytes[index] ?? 0);
      }
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: { mimeType: 'audio/pcm;rate=16000', data: btoa(binary) },
        },
      }));
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(context.destination);
    sourceRef.current = source;
    processorRef.current = processor;
    gainRef.current = gain;
  };

  const playAudio = (base64: string, mimeType: string) => {
    const context = contextRef.current;
    if (!context || !activeRef.current) return;
    const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (bytes.byteLength % 2 !== 0) throw new Error(t('voice.incompleteAudio'));
    const pcm = new Int16Array(bytes.buffer);
    const audioBuffer = context.createBuffer(1, pcm.length, rate);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index++) channel[index] = (pcm[index] ?? 0) / 32768;

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + audioBuffer.duration;
    playbackRef.current.push(source);
    source.onended = () => {
      playbackRef.current = playbackRef.current.filter((item) => item !== source);
    };
    setStatus('speaking');
  };

  const start = async () => {
    if (activeRef.current) return;
    let sessionAbort: AbortController | null = null;
    try {
      setCompact(true);
      setError('');
      setStatus('connecting');
      activeRef.current = true;
      const currentSessionAbort = new AbortController();
      sessionAbort = currentSessionAbort;
      sessionAbortRef.current = currentSessionAbort;

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t('voice.micUnavailable'));
      }
      if (typeof AudioContext === 'undefined') {
        throw new Error(t('voice.audioUnavailable'));
      }
      const context = new AudioContext();
      contextRef.current = context;
      await context.resume();
      if (currentSessionAbort.signal.aborted) return;

      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (currentSessionAbort.signal.aborted) return;

      const response = await fetch('/api/gemini/token', {
        method: 'POST',
        signal: currentSessionAbort.signal,
      });
      const tokenResult = (await response.json().catch(() => ({}))) as GeminiLiveToken;
      if (!response.ok) {
        const messages: Record<string, string> = {
          gemini_not_configured: t('voice.geminiNotConfigured'),
          gemini_api_key_format_invalid: t('voice.geminiKeyInvalid'),
          gemini_token_unavailable: t('voice.geminiTokenUnavailable'),
        };
        throw new Error(messages[tokenResult.error ?? ''] ?? t('voice.geminiAccessUnavailable'));
      }
      if (!tokenResult.token || !tokenResult.model) {
        throw new Error(t('voice.invalidToken'));
      }
      if (currentSessionAbort.signal.aborted) return;

      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenResult.token)}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (!activeRef.current || currentSessionAbort.signal.aborted) {
          socket.close();
          return;
        }
        const model = tokenResult.model?.startsWith('models/')
          ? tokenResult.model
          : `models/${tokenResult.model}`;
        socket.send(JSON.stringify({
          setup: {
            model,
            generationConfig: { responseModalities: ['AUDIO'] },
            systemInstruction: {
              parts: [{
                text:
                  'Eres Manguaré, asistente de voz en español. Usa las herramientas para realizar operaciones reales en la aplicación y espera su resultado antes de decir que una pantalla o campo cambió. ' +
                  'Para vender o publicar, llama open_listing_form y espera a que se confirme que abrió. Consulta get_listing_form_schema y get_listing_form_values. ' +
                  'Completa solo información expresada por la persona; no inventes precio, descripción, categoría, ubicación ni datos del producto. Pregunta por un solo campo faltante por turno, actualiza el campo con update_listing_form_fields y comprueba el resultado. ' +
                  'Los campos title, category, price, location y description son requeridos para una publicación asistida por voz; la foto es opcional. Para categoría usa las opciones devueltas por el formulario. ' +
                  'Si la persona solicita usar su ubicación, llama use_current_location, espera el resultado real y comunica cualquier error. No solicites que escriba coordenadas si puedes usar esa herramienta. Advierte que el GPS exacto será compartido en la publicación. ' +
                  'Cuando validate_listing_form confirme que todo está completo, llama request_listing_publication_confirmation, lee fielmente el resumen, incluyendo que la ubicación GPS exacta se compartirá cuando aplique, y solicita autorización explícita. Solo llama publish_listing si la última transcripción del usuario es una aprobación explícita después de ese resumen y usa el confirmationId devuelto. Si cambia un dato, solicita una nueva confirmación. Si cancela, llama cancel_listing_publication y no publiques. ' +
                  'Nunca digas que publicaste sin que publish_listing devuelva success=true. No crees alertas ni navegues a Emergencias para cerrar o cancelar la conversación. La cancelación no es una orden de navegación.',
              }],
            },
            tools: [{ functionDeclarations: VOICE_FUNCTION_DECLARATIONS }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }));
      };

      socket.onmessage = async (event) => {
        if (!activeRef.current) return;
        try {
          const raw = event.data instanceof Blob ? await event.data.text() : event.data;
          const message = JSON.parse(String(raw));
          const serverContent = message.serverContent;
          const transcription = serverContent?.inputTranscription;
          if (typeof transcription?.text === 'string') {
            partialTranscriptRef.current += transcription.text;
            lastUserUtteranceRef.current = partialTranscriptRef.current.trim();
          }
          if (transcription?.finished || serverContent?.turnComplete) {
            if (partialTranscriptRef.current.trim()) {
              lastUserUtteranceRef.current = partialTranscriptRef.current.trim();
            }
            partialTranscriptRef.current = '';
          }

          const cancelledIds = message.toolCallCancellation?.ids;
          if (Array.isArray(cancelledIds)) {
            for (const id of cancelledIds) {
              if (typeof id === 'string') toolAbortControllersRef.current.get(id)?.abort();
            }
          }

          const calls = message.toolCall?.functionCalls ?? [];
          if (calls.length > 0) {
            const functionResponses = [];
            for (const call of calls as Array<{
              id: string;
              name: string;
              args?: Record<string, unknown>;
            }>) {
              if (!activeRef.current || currentSessionAbort.signal.aborted) break;
              const controller = new AbortController();
              const abortSession = () => controller.abort();
              currentSessionAbort.signal.addEventListener('abort', abortSession, { once: true });
              toolAbortControllersRef.current.set(call.id, controller);
              try {
                const result = await handlerRef.current(call.name, call.args ?? {}, {
                  signal: controller.signal,
                  lastUserUtterance: lastUserUtteranceRef.current,
                });
                if (!controller.signal.aborted) {
                  functionResponses.push({ id: call.id, name: call.name, response: { result } });
                }
              } catch (toolError) {
                if (!controller.signal.aborted) {
                  functionResponses.push({
                    id: call.id,
                    name: call.name,
                    response: {
                      result: {
                        success: false,
                        message: toolError instanceof Error
                          ? toolError.message
                          : 'No se pudo ejecutar la acción.',
                      },
                    },
                  });
                }
              } finally {
                currentSessionAbort.signal.removeEventListener('abort', abortSession);
                toolAbortControllersRef.current.delete(call.id);
              }
            }
            if (
              activeRef.current &&
              socket.readyState === WebSocket.OPEN &&
              functionResponses.length > 0
            ) {
              socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
            }
          }

          if (message.setupComplete) {
            startAudioInput();
            setStatus('listening');
          }
          if (serverContent?.interrupted) {
            stopPlayback();
            setStatus('listening');
          }
          for (const part of serverContent?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              playAudio(part.inlineData.data, part.inlineData.mimeType ?? 'audio/pcm;rate=24000');
            }
          }
          if (serverContent?.turnComplete) setStatus('listening');
        } catch (messageError) {
          if (activeRef.current) {
            setError(messageError instanceof Error ? messageError.message : t('voice.responseProcessingError'));
            setStatus('error');
            cleanup();
          }
        }
      };

      socket.onerror = () => {
        if (!activeRef.current) return;
        setError(t('voice.connectionFailed'));
        setStatus('error');
        cleanup();
      };
      socket.onclose = (closeEvent) => {
        if (!activeRef.current) return;
        setError(t('voice.connectionClosed', { code: closeEvent.code }));
        setStatus('error');
        cleanup();
      };
    } catch (startError) {
      if (sessionAbort?.signal.aborted) return;
      cleanup();
      setStatus('error');
      setError(startError instanceof Error ? startError.message : t('voice.startFailed'));
    }
  };

  const close = () => {
    cleanup();
    onClose();
  };

  const statusText = {
    idle: t('voice.idle'),
    connecting: t('voice.connecting'),
    listening: t('voice.listening'),
    speaking: t('voice.speaking'),
    error: t('voice.interrupted'),
  }[status];

  return (
    <section
      className={`voice-assistant${compact ? ' is-compact' : ''}`}
      aria-label={t('voice.assistantLabel')}
    >
      {compact ? (
        <div className="voice-active-controls" data-testid="voice-active-controls">
          <span className={`voice-active-icon ${status}`} aria-hidden="true">
            <Mic size={19} />
          </span>
          <div className="voice-active-info">
            <strong>Manguaré</strong>
            <span className="voice-active-status" aria-live="polite">{statusText}</span>
            {error && <span className="voice-compact-error" role="alert">{error}</span>}
          </div>
          {status === 'error' && (
            <button type="button" className="voice-retry" onClick={() => void start()}>
              {t('voice.retry')}
            </button>
          )}
          <button
            type="button"
            className="voice-close"
            onClick={close}
            aria-label={t('voice.cancelCall')}
          >
            <PhoneOff size={20} />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="voice-close"
            onClick={close}
            aria-label={t('voice.closeAssistant')}
          >
            <X size={22} />
          </button>

          <div className={`voice-orb ${status}`}>
            <div className="voice-orb-inner">
              <Sparkles size={42} />
            </div>
          </div>

          <h2>Manguaré</h2>
          <p className="voice-status" aria-live="polite">
            {status === 'idle' && statusText}
            {status === 'connecting' && statusText}
            {status === 'listening' && statusText}
            {status === 'speaking' && statusText}
            {status === 'error' && t('voice.startFailed')}
          </p>
          {error && <p className="voice-error" role="alert">{error}</p>}

          {status === 'idle' || status === 'error' ? (
            <button type="button" className="voice-start" onClick={() => void start()}>
              <Mic size={20} />
              {status === 'error' ? t('voice.retry') : t('voice.start')}
            </button>
          ) : (
            <button type="button" className="voice-start voice-stop" onClick={close}>
              <PhoneOff size={20} />
              {t('voice.endCall')}
            </button>
          )}

          <p className="voice-hint">{t('voice.hint')}</p>
        </>
      )}
    </section>
  );
}
