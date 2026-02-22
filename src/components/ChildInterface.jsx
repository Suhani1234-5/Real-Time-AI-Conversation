import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Star, Heart, Sun, Cloud, Sparkles, MessageCircle, ArrowDown, Upload, Timer, RotateCcw, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useVapi } from '../hooks/useVapi';

const ChildInterface = () => {
    const {
        isConnecting,
        isConnected,
        isAssistantSpeaking,
        transcript,
        setTranscript,
        celebrationActive,
        activeAction,
        startCall,
        stopCall
    } = useVapi();

    const [bgColor, setBgColor] = useState('bg-gradient-to-b from-[#E0F2FE] to-[#F0F9FF]');
    const [uploadedImage, setUploadedImage] = useState(null);
    const [imageContext, setImageContext] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [timeLeft, setTimeLeft] = useState(60);
    const [timerActive, setTimerActive] = useState(false);

    const scrollRef = useRef(null);
    const fileInputRef = useRef(null);

    // Auto-scroll chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcript, isThinking]);

    // Timer logic
    useEffect(() => {
        let interval = null;
        if (isConnected && timeLeft > 0) {
            setTimerActive(true);
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (!isConnected || timeLeft === 0) {
            setTimerActive(false);
            if (timeLeft === 0 && isConnected) {
                stopCall();
            }
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isConnected, timeLeft, stopCall]);

    // Reset timer when call starts
    useEffect(() => {
        if (isConnected) {
            setTimeLeft(60);
        }
    }, [isConnected]);

    // Handle Magical Actions triggered by AI
    useEffect(() => {
        if (activeAction) {
            if (activeAction.action === 'add_sparkle_effect') {
                confetti({
                    particleCount: 50,
                    spread: 80,
                    origin: { x: 0.3, y: 0.5 },
                    colors: ['#FFE66D', '#FFFFFF', '#4ECDC4']
                });
            } else if (activeAction.action === 'change_background_color') {
                setBgColor('bg-gradient-to-b from-[#FDE68A] to-[#F59E0B]'); // Bold Gold
                setTimeout(() => setBgColor('bg-gradient-to-b from-[#E0F2FE] to-[#F0F9FF]'), 3000);
            }
        }
    }, [activeAction]);

    useEffect(() => {
        if (celebrationActive) {
            confetti({
                particleCount: 150,
                spread: 120,
                origin: { y: 0.6 },
                colors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF9F43', '#A29BFE']
            });
            setBgColor('bg-gradient-to-b from-[#FEF3C7] to-[#FFFBEB]');
            const timer = setTimeout(() => setBgColor('bg-gradient-to-b from-[#E0F2FE] to-[#F0F9FF]'), 4000);
            return () => clearTimeout(timer);
        }
    }, [celebrationActive]);

    useEffect(() => {
        if (!isConnected && timeLeft === 0) {
            confetti({
                particleCount: 200,
                spread: 160,
                origin: { y: 0.6 },
                colors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF9F43', '#A29BFE']
            });
        }
    }, [isConnected, timeLeft]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result;
                setUploadedImage(base64);

                // Analyze with Gemini Vision
                setIsAnalyzing(true);
                // Clear old transcript context during new analysis
                setTranscript([{ role: 'assistant', text: "Roby is looking at your photo... 🤖🔍", id: 'analyzing-msg' }]);

                try {
                    const response = await fetch('http://localhost:3001/analyze-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64 })
                    });

                    if (!response.ok) throw new Error(`Server returned ${response.status}`);

                    const data = await response.json();
                    if (data.description) {
                        console.log("---------------------------");
                        console.log("FRONTEND IMAGE CONTEXT RECEIVED:", data.description);
                        if (data.structuredData) {
                            console.log("STRUCTURED DATA:", data.structuredData);
                        }
                        console.log("---------------------------");

                        setImageContext(data.description);
                        // Update with real description
                        setTranscript([{ role: 'assistant', text: data.description, id: 'initial-desc' }]);

                        // After chat starts (analysis done), attempt to start Vapi voice call
                        startCall(data.description);
                    }
                } catch (error) {
                    console.error("Analysis Failed:", error);
                    setTranscript([{ role: 'assistant', text: "Oh no! I couldn't see that photo very well. Can you try another one? 🧙‍♂️✨", id: 'analysis-error' }]);
                    setImageContext("");
                } finally {
                    setIsAnalyzing(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || isThinking) return;

        const userMsg = chatInput.trim();
        setChatInput('');

        // Add user message to chat
        setTranscript(prev => [...prev, { role: 'user', text: userMsg, id: Date.now() }]);

        // Get Gemini response
        setIsThinking(true);
        try {
            const response = await fetch('http://localhost:3001/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg,
                    context: imageContext,
                    history: transcript.map(t => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] }))
                })
            });

            if (!response.ok) {
                console.error(`Chat Server Error: ${response.status}`);
                throw new Error(`Server responded with ${response.status}`);
            }

            const data = await response.json();
            if (data.response) {
                setTranscript(prev => [...prev, { role: 'assistant', text: data.response, id: Date.now() + 1 }]);
            }
        } catch (error) {
            console.error("Chat Failed:", error);
            setTranscript(prev => [...prev, { role: 'assistant', text: "Oh no! My magic brain is sleepy. Can you try again?", id: Date.now() + 2 }]);
        } finally {
            setIsThinking(false);
        }
    };


    return (
        <div className={`h-screen w-full flex flex-col items-center py-4 px-6 relative transition-colors duration-1000 overflow-hidden ${bgColor}`}>

            {/* Ambient Background Magic */}
            <div className="fixed inset-0 pointer-events-none">
                <motion.div
                    animate={{ y: [0, -30, 0], opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 5, repeat: Infinity }}
                    className="absolute top-10 left-[10%] text-yellow-300"
                >
                    <Sun size={120} fill="currentColor" />
                </motion.div>
                <motion.div
                    animate={{ x: [-20, 20, -20], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 8, repeat: Infinity }}
                    className="absolute top-32 right-[15%] text-blue-200"
                >
                    <Cloud size={140} fill="currentColor" />
                </motion.div>
            </div>

            {/* Header section */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center mb-4 z-10 shrink-0"
            >
                <div className="flex items-center justify-center gap-4 mb-1">
                    <Star className="text-yellow-400" fill="currentColor" />
                    <h1 className="text-4xl lg:text-5xl font-fredoka font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500">
                        Magic Robot Adventure!
                    </h1>
                    <Star className="text-yellow-400" fill="currentColor" />
                </div>
                <p className="text-gray-500 font-bold text-lg font-nunito">Meet Magic Robot, your cheerful AI friend! 🤖✨</p>
            </motion.div>

            <div className="flex flex-col lg:flex-row gap-6 items-stretch justify-center w-full max-w-7xl z-10 flex-1 min-h-0 mb-4">

                {/* Left Side: Magical Stage */}
                <motion.div
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="glass-card p-6 flex flex-col items-center gap-6 w-full lg:w-1/2 magic-glow relative"
                >
                    {/* Timer Display Inside Left Panel */}
                    <AnimatePresence>
                        {isConnected && (
                            <motion.div
                                initial={{ y: -50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -50, opacity: 0 }}
                                className="absolute -top-4 z-20"
                            >
                                <div className={`flex items-center gap-3 px-6 py-2 rounded-full border-4 border-white shadow-xl font-black text-xl 
                                    ${timeLeft <= 10 ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-indigo-500'}`}>
                                    <Timer size={20} />
                                    <span>{timeLeft}s to Play!</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="relative group flex-1 flex items-center justify-center w-full min-h-0">
                        <AnimatePresence>
                            {(isAssistantSpeaking || (activeAction && activeAction.action === 'highlight_object')) && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{
                                        scale: activeAction?.action === 'highlight_object' ? 1.4 : 1.5,
                                        opacity: activeAction?.action === 'highlight_object' ? 0.6 : 0.2
                                    }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    transition={{ repeat: Infinity, duration: activeAction?.action === 'highlight_object' ? 0.8 : 1.5 }}
                                    className={`absolute inset-0 rounded-[4rem] blur-[40px] lg:blur-[60px] ${activeAction?.action === 'highlight_object' ? 'bg-yellow-400' : 'bg-blue-400'}`}
                                />
                            )}
                        </AnimatePresence>

                        <motion.div
                            animate={{
                                y: isAssistantSpeaking ? [0, -15, 0] : [0, -5, 0],
                                scale: activeAction?.action === 'zoom_on_object' ? 1.15 : (activeAction?.action === 'animate_object' ? [1, 1.1, 1] : 1),
                                rotate: activeAction?.action === 'animate_object' ? [0, 5, -5, 0] : 0
                            }}
                            transition={{
                                y: { duration: isAssistantSpeaking ? 0.8 : 4, repeat: Infinity },
                                scale: { duration: 0.5 },
                                rotate: { duration: 0.5, repeat: activeAction?.action === 'animate_object' ? 4 : 0 }
                            }}
                            className={`relative z-10 w-full h-full max-h-[300px] lg:max-h-none rounded-[3rem] lg:rounded-[4rem] overflow-hidden border-8 border-white shadow-2xl ring-4 ring-secondary/20 bg-white transition-all flex items-center justify-center`}
                        >
                            <img
                                src={uploadedImage || "https://img.freepik.com/free-vector/cute-robot-waving-hand-cartoon-character_1308-158971.jpg"}
                                alt="Robot"
                                className="w-full h-full object-contain"
                            />

                            {/* Magic Label for Active Tool Targets */}
                            <AnimatePresence>
                                {activeAction && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 40 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 40 }}
                                        className="absolute bottom-10 left-0 right-0 flex justify-center z-30"
                                    >
                                        <div className="bg-white/90 px-6 py-2 rounded-full shadow-2xl border-4 border-yellow-400 font-black text-indigo-600 flex items-center gap-2 font-fredoka">
                                            <Zap size={20} className="text-yellow-500 fill-current" />
                                            {activeAction.target}!
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Upload Overlay */}
                            <button
                                onClick={() => fileInputRef.current.click()}
                                className="absolute top-4 right-4 bg-white/90 hover:bg-white p-3 rounded-2xl shadow-lg transition-transform hover:scale-110 active:scale-90 flex items-center gap-2 font-black text-gray-700 text-sm z-30"
                            >
                                <Upload size={20} className="text-secondary" />
                            </button>

                            {isConnecting && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-40">
                                    <div className="flex gap-2">
                                        {[1, 2, 3].map(i => (
                                            <motion.div
                                                key={i}
                                                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                                                transition={{ delay: i * 0.2, repeat: Infinity }}
                                                className="w-4 h-4 rounded-full bg-secondary"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                            accept="image/*"
                            className="hidden"
                        />

                        {isAssistantSpeaking && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="absolute -top-4 -right-4 bg-white px-5 py-2 rounded-2xl shadow-xl border-4 border-secondary flex items-center gap-2 z-20"
                            >
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                                    <Sparkles className="text-yellow-500" size={24} />
                                </motion.div>
                                <span className="font-black text-secondary uppercase text-sm font-fredoka">Talking!</span>
                            </motion.div>
                        )}
                    </div>

                    <div className="w-full shrink-0">
                        <button
                            onClick={isConnected ? stopCall : () => startCall(imageContext)}
                            disabled={isConnecting || isAnalyzing}
                            className={`
                                w-full py-4 lg:py-6 rounded-[2.5rem] text-white font-fredoka font-black text-2xl lg:text-3xl shadow-2xl flex items-center justify-center gap-4 transition-all
                                ${isConnected
                                    ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:brightness-110'
                                    : 'bg-gradient-to-r from-secondary to-blue-500 hover:scale-[1.02]'}
                                ${(isConnecting || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}
                            `}
                        >
                            {isAnalyzing ? (
                                <><RotateCcw className="animate-spin" size={32} /> Analyzing...</>
                            ) : isConnected ? (
                                <><MicOff size={32} /> Bye Bye!</>
                            ) : (
                                <><Mic size={32} /> Let's Play!</>
                            )}
                        </button>
                    </div>
                </motion.div>

                {/* Right Side: Magic Chat Box */}
                <motion.div
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex flex-col gap-6 w-full lg:w-1/2 min-h-0"
                >
                    {/* Adventure Log (Magic Chat Box) */}
                    <div className="flex-1 bg-white/40 backdrop-blur-xl rounded-[3rem] p-6 lg:p-8 shadow-2xl border-4 border-white flex flex-col min-h-0 relative overflow-hidden">

                        <div className="flex items-center gap-3 mb-4 lg:mb-6 shrink-0">
                            <div className="p-3 bg-indigo-500 rounded-2xl text-white shadow-lg">
                                <Sparkles size={24} />
                            </div>
                            <h2 className="text-2xl lg:text-3xl font-fredoka font-black text-indigo-700 uppercase tracking-tighter">Adventure Log</h2>
                        </div>

                        {/* Scrolling Chat Content */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto pr-2 lg:pr-4 space-y-6 custom-scrollbar scroll-smooth mb-4 min-h-0"
                        >
                            {transcript.length === 0 && !isAnalyzing && (
                                <div className="h-full flex flex-col items-center justify-center opacity-40 text-indigo-400 text-center px-10">
                                    <MessageCircle size={64} className="mb-4" />
                                    <p className="font-fredoka font-bold text-xl italic balance">Upload a photo to start our magical journey!</p>
                                </div>
                            )}

                            {isAnalyzing && (
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 shrink-0">
                                        <RotateCcw className="animate-spin" />
                                    </div>
                                    <div className="bg-indigo-50 p-6 rounded-3xl rounded-tl-none border-2 border-indigo-100 italic font-nunito font-bold text-indigo-400">
                                        Roby is looking closely...
                                    </div>
                                </div>
                            )}

                            <AnimatePresence initial={false}>
                                {transcript.map((msg) => (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                    >
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-white text-secondary'
                                            }`}>
                                            {msg.role === 'user' ? <Heart size={20} fill="currentColor" /> : <Star size={20} fill="currentColor" />}
                                        </div>
                                        <div className={`
                                            max-w-[85%] p-5 lg:p-6 rounded-[2rem] shadow-sm text-lg font-nunito font-bold leading-relaxed
                                            ${msg.role === 'user'
                                                ? 'bg-indigo-500 text-white rounded-tr-none'
                                                : 'bg-white text-gray-700 rounded-tl-none border-t-4 border-secondary'}
                                        `}>
                                            {msg.text}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {isThinking && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-start gap-4"
                                >
                                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-secondary shrink-0 shadow-md">
                                        <Sparkles className="animate-pulse" size={20} />
                                    </div>
                                    <div className="bg-white/60 p-4 rounded-3xl rounded-tl-none flex gap-2">
                                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-2 h-2 rounded-full bg-secondary" />
                                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 rounded-full bg-secondary" />
                                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 rounded-full bg-secondary" />
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Multimodal Chat Input */}
                        <form
                            onSubmit={handleSendMessage}
                            className="relative mt-2 z-20 group shrink-0"
                        >
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Type a message to Roby..."
                                className="w-full bg-white/80 backdrop-blur-md border-4 border-indigo-100 rounded-full py-4 lg:py-5 px-6 lg:px-8 pr-16 text-lg lg:text-xl font-nunito font-bold text-indigo-700 placeholder:text-indigo-300 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all shadow-xl group-hover:bg-white"
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isThinking}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-indigo-500 text-white rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100"
                            >
                                <Sparkles size={24} />
                            </button>
                        </form>

                        {/* Aesthetic Background Detail */}
                        <div className="absolute top-0 right-0 -mr-10 -mt-10 opacity-5 pointer-events-none">
                            <MessageCircle size={200} fill="currentColor" className="text-indigo-900" />
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Bottom Fun Overlay */}
            <AnimatePresence>
                {celebrationActive && (
                    <motion.div
                        initial={{ scale: 0, y: 50 }}
                        animate={{ scale: 1.1, y: 0 }}
                        exit={{ scale: 0 }}
                        className="fixed bottom-10 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-fredoka font-black px-12 py-6 rounded-full shadow-2xl z-50 border-8 border-white text-3xl flex items-center gap-4"
                    >
                        <Heart fill="white" size={40} className="animate-pulse" />
                        AMAZING JOB!
                        <Heart fill="white" size={40} className="animate-pulse" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChildInterface;
