import { useEffect, useState, useCallback, useRef } from 'react';
import Vapi from '@vapi-ai/web';

const getVapi = () => {
  const key = import.meta.env.VITE_VAPI_PUBLIC_KEY;
  if (!key || key === 'your_vapi_public_key_here' || key === 'YOUR_VAPI_PUBLIC_KEY') return null;
  return new Vapi(key);
};

export const useVapi = () => {
  const [vapiInstance, setVapiInstance] = useState(getVapi);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [celebrationActive, setCelebrationActive] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // { action, target }

  const vapiRef = useRef(null);

  useEffect(() => {
    const instance = getVapi();
    if (!instance) return;

    vapiRef.current = instance;
    setVapiInstance(instance);

    instance.on('call-start', () => {
      console.log("🚀 Vapi Call Started");
      setIsConnecting(false);
      setIsConnected(true);
      setTranscript([]); // Clear for new session
      setActiveAction(null);
    });

    instance.on('call-end', () => {
      console.log("� Vapi Call Ended");
      setIsConnecting(false);
      setIsConnected(false);
      setActiveAction(null);
    });

    instance.on('speech-start', () => setIsAssistantSpeaking(true));
    instance.on('speech-end', () => setIsAssistantSpeaking(false));

    instance.on('message', (message) => {
      setLastMessage(message);

      if (message.type === 'transcript' && message.transcriptType === 'final') {
        const text = message.transcript.trim();
        console.log("📝 Transcript:", text);

        // Check for JSON commands in the transcript (Structured Session Flow)
        if (text.startsWith('{') && text.endsWith('}')) {
          try {
            const data = JSON.parse(text);
            if (data.type === 'tool_call') {
              setActiveAction({
                action: data.action,
                target: data.target
              });
              setTimeout(() => setActiveAction(null), 6000);
              return; // Don't add JSON to visible transcript
            }
            if (data.type === 'session_complete') {
              console.log("🏁 Session Complete Command Received");
              instance.stop();
              return;
            }
          } catch (e) {
            // Not valid JSON, continue to normal transcript
          }
        }

        setTranscript(prev => [...prev.slice(-10), {
          role: message.role,
          text: text,
          id: Date.now()
        }]);
      }

      // Handle standard tool-calls if configured in Vapi Dashboard
      if (message.type === 'tool-calls') {
        const toolCall = message.toolCalls[0];
        const args = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;

        if (toolCall.function.name === 'trigger_action' || toolCall.function.name === 'tool_call' || args.type === 'tool_call') {
          setActiveAction({
            action: args.action || (args.type === 'tool_call' ? args.action : null),
            target: args.target
          });
          setTimeout(() => setActiveAction(null), 6000);
        }

        if (toolCall.function.name === 'session_complete' || args.type === 'session_complete') {
          instance.stop();
        }

        if (toolCall.function.name === 'celebrate') {
          setCelebrationActive(true);
          setTimeout(() => setCelebrationActive(false), 5000);
        }
      }
    });

    instance.on('error', (error) => {
      console.error('❌ Vapi error:', error);
      console.log('🔍 FULL VAPI ERROR:', JSON.stringify(error, null, 2));
      setIsConnecting(false);

      // Explicit check for authentication failures
      if (error.type === 'start-method-error' || (error.error && error.error.statusCode === 401)) {
        alert('Authentication Failed (401) ❌\n\nYour Vapi Public Key in .env might be incorrect or is a Secret Key instead of a Public Key.');
      }
    });

    return () => {
      instance.removeAllListeners();
    };
  }, []);

  const startCall = useCallback((imageContext = '') => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID;

    console.log("🔑 Initializing Call with Assistant ID:", assistantId);

    if (!publicKey || publicKey.includes('YOUR_VAPI_PUBLIC_KEY')) {
      alert('Missing Vapi Public Key! Please add VITE_VAPI_PUBLIC_KEY to your .env file.');
      return;
    }

    if (!assistantId || assistantId.includes('your_')) {
      alert('Missing Vapi Assistant ID! Please add VITE_VAPI_ASSISTANT_ID to your .env file.');
      return;
    }

    if (!vapiRef.current) {
      const newInstance = new Vapi(publicKey);
      setVapiInstance(newInstance);
      vapiRef.current = newInstance;
      // Setup listeners again or hope the effect runs... 
      // Better to reload the page in this extreme edge case.
      alert('Vapi was not ready. Re-initializing... please try again in a moment.');
      return;
    }

    setIsConnecting(true);

    // Prepare overrides to inject image context
    const assistantOverrides = {
      variableValues: {
        imageContext: imageContext || "a fun mystery image"
      }
    };

    // Also override the system prompt directly if we have a description
    if (imageContext) {
      assistantOverrides.model = {
        provider: "google",
        model: "gemini-2.0-flash",
        systemPrompt: `You are Magic Robot, a cheerful AI friend for children aged 4-8. You are looking at an image that has been analyzed: ${imageContext}. Conduct a 1-minute fun conversation about this image. Ask one question at a time and be very playful! Do NOT repeat the literal description to the child; instead, ask them about something specific in the image.`
      };
    }

    console.log("📤 Starting Vapi with config:", { assistantId, assistantOverrides });
    vapiRef.current.start(assistantId, assistantOverrides);
  }, []);

  const stopCall = useCallback(() => {
    if (vapiRef.current) vapiRef.current.stop();
  }, []);

  return {
    isConnecting,
    isConnected,
    isAssistantSpeaking,
    lastMessage,
    transcript,
    setTranscript,
    celebrationActive,
    activeAction,
    startCall,
    stopCall,
  };
};