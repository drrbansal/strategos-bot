import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'; // Not strictly needed for this bot, but good practice for Firebase setup

// Main App component for the Gemini Bot
const App = () => {
  // State to store chat messages, each with a role (user/model) and text
  const [messages, setMessages] = useState([]);
  // State for the current input text
  const [input, setInput] = useState('');
  // State to indicate if the bot is currently loading a response
  const [loading, setLoading] = useState(false);
  // Ref to automatically scroll to the bottom of the chat
  const messagesEndRef = useRef(null);

  // Firebase states (initialized for potential future use, not directly used for bot logic)
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Effect to initialize Firebase and handle authentication
  useEffect(() => {
    try {
      // Access global variables for Firebase config and app ID
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

      // Initialize Firebase app
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      // Listen for authentication state changes
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // User is signed in
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // User is signed out, try to sign in anonymously if no custom token
          try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase Auth Error:", error);
            // Fallback for userId if anonymous sign-in also fails
            setUserId(crypto.randomUUID());
          } finally {
            setIsAuthReady(true);
          }
        }
      });

      // Cleanup subscription on unmount
      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setIsAuthReady(true); // Ensure app can still render even if Firebase fails
      setUserId(crypto.randomUUID()); // Provide a fallback userId
    }
  }, []);

  // Effect to scroll to the bottom of the chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Function to send a message to the Gemini API
  const handleSendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { role: 'user', text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Prepare chat history for the API call
      let chatHistory = [...messages, userMessage].map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const payload = { contents: chatHistory };
      const apiKey = "AIzaSyDINxWMm0-osi4rZ0lJGMz6FzGDUO8swLk"; // Canvas will automatically provide the API key at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const botResponseText = result.candidates[0].content.parts[0].text;
        setMessages((prevMessages) => [...prevMessages, { role: 'model', text: botResponseText }]);
      } else {
        setMessages((prevMessages) => [...prevMessages, { role: 'model', text: "Sorry, I couldn't generate a response." }]);
        console.error("Unexpected API response structure:", result);
      }
    } catch (error) {
      console.error("Error sending message to Gemini API:", error);
      setMessages((prevMessages) => [...prevMessages, { role: 'model', text: `Error: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center p-4 font-inter">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col h-[80vh] border border-gray-200">
        <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-2xl shadow-md flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Gemini Bot
          </h1>
          {userId && (
            <span className="text-sm px-3 py-1 bg-white bg-opacity-20 rounded-full">
              User ID: {userId.substring(0, 8)}...
            </span>
          )}
        </header>

        <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-10">
              <p className="text-lg">Start a conversation with your Gemini Bot!</p>
              <p className="text-sm">Type a message below and hit send.</p>
            </div>
          )}
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] p-3 rounded-xl shadow-md ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-gray-200 text-gray-800 rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[75%] p-3 rounded-xl shadow-md bg-gray-200 text-gray-800 rounded-bl-none">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce-dot" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce-dot" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce-dot" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} /> {/* Scroll target */}
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center space-x-3 rounded-b-2xl bg-gray-50">
          <input
            type="text"
            className="flex-1 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder-gray-400"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSendMessage();
              }
            }}
            disabled={loading}
          />
          <button
            onClick={handleSendMessage}
            className="bg-blue-600 text-white p-3 rounded-xl shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            disabled={loading}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Tailwind CSS and Font Inter setup */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
        .animate-bounce-dot {
          animation: bounce-dot 1.4s infinite ease-in-out both;
        }
      `}</style>
    </div>
  );
};

export default App;
