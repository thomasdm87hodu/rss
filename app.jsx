import React, { useState, useEffect, useRef } from 'react';
import { 
  Rss, 
  LayoutGrid, 
  List as ListIcon, 
  Settings2, 
  Code, 
  Copy, 
  ExternalLink, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  AlignLeft,
  Palette,
  MoreHorizontal,
  Timer
} from 'lucide-react';

// --- Helper: Mock Data Fallback ---
const MOCK_DATA = [
  { id: '1', title: 'The Future of AI in Web Development', link: '#', description: 'Discover how artificial intelligence is shaping the way we build and design websites in 2026 and beyond.', image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=400&h=250' },
  { id: '2', title: '10 Essential Tailwind CSS Patterns', link: '#', description: 'A comprehensive guide to reusable utility-class patterns that will speed up your workflow and reduce CSS bloat.', image: 'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&q=80&w=400&h=250' },
  { id: '3', title: 'Next-Generation JavaScript Features', link: '#', description: 'An overview of the latest ECMAScript proposals and how they can simplify your everyday coding tasks.', image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=400&h=250' },
  { id: '4', title: 'Designing for Accessibility', link: '#', description: 'Practical tips to ensure your web applications are usable by everyone, including those relying on screen readers.', image: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&q=80&w=400&h=250' },
  { id: '5', title: 'Optimizing React Performance', link: '#', description: 'Learn advanced techniques for reducing re-renders and keeping your React applications lightning fast.', image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&q=80&w=400&h=250' },
];

export default function App() {
  const [url, setUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedItems, setFeedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Widget Configuration State
  const [config, setConfig] = useState({
    layout: 'list', // list, grid, ticker
    theme: 'light', // light, dark
    accentColor: '#3b82f6', // default blue
    showImages: true,
    showDescription: true,
    maxItems: 5,
    tickerSpeed: 50, // 0-100 speed scale
    tickerCharLimit: 80, // max chars per item
  });

  // Handle URL Fetch and Parsing
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!url) return;
    
    setIsGenerating(true);
    setErrorMsg('');
    setInfoMsg('');
    
    try {
      // Adjust Telegram URLs to point to the web preview feed (/s/)
      let fetchUrl = url;
      if (fetchUrl.match(/t\.me\/[a-zA-Z0-9_]+$/) && !fetchUrl.includes('/s/')) {
        fetchUrl = fetchUrl.replace('t.me/', 't.me/s/');
      }

      // =====================================================================
      // IMPORTANT: Replace this URL with your actual Vercel deployment URL!
      // Example: 'https://my-rss-proxy.vercel.app/api/fetch'
      // =====================================================================
      const myBackendUrl = 'https://YOUR_VERCEL_PROJECT_URL.vercel.app/api/fetch'; 
      
      let htmlString = '';
      
      try {
        // First try to use your custom Vercel backend
        const response = await fetch(`${myBackendUrl}?url=${encodeURIComponent(fetchUrl)}`);
        if (!response.ok) throw new Error('Vercel backend failed or not configured');
        htmlString = await response.text();
      } catch (backendErr) {
        console.warn('Custom backend failed, falling back to allOrigins proxy for demo purposes...', backendErr);
        // Fallback to free proxy just so the app still works here in the preview
        const resFallback = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(fetchUrl)}`);
        const data = await resFallback.json();
        htmlString = data.contents;
      }

      if (!htmlString || !htmlString.includes('<html')) {
         throw new Error("Could not fetch valid HTML from the target URL.");
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      const baseUrl = new URL(fetchUrl).origin;
      
      let items = [];
      
      // Custom Parser for Telegram
      if (fetchUrl.includes('t.me/s/')) {
        const messages = doc.querySelectorAll('.tgme_widget_message');
        
        if (messages.length === 0) {
           throw new Error("No Telegram messages found. The channel might be private or blocking preview access.");
        }

        messages.forEach((msg) => {
          const textEl = msg.querySelector('.tgme_widget_message_text');
          const dateLink = msg.querySelector('.tgme_widget_message_date');

          if (textEl && dateLink) {
            const description = textEl.innerText.trim();
            
            // Extract a generous amount of text so the character limit slider can do its job
            let title = description.replace(/\n/g, ' ').substring(0, 250);
            if (description.length > 250) title += '...';
            if (!title) title = 'Telegram Update';

            let link = dateLink.getAttribute('href');
            if (link && !link.startsWith('http')) link = new URL(link, baseUrl).href;

            let image = '';
            // Try background image first, then standard img tag
            const photoWrap = msg.querySelector('.tgme_widget_message_photo_wrap');
            if (photoWrap) {
              const style = photoWrap.getAttribute('style');
              const match = style && style.match(/background-image:url\('([^']+)'\)/);
              if (match) image = match[1];
            } else {
               const imgEl = msg.querySelector('.tgme_widget_message_photo img');
               if (imgEl && imgEl.getAttribute('src')) image = imgEl.getAttribute('src');
            }

            items.push({ id: Math.random().toString(), title, link, description, image });
          }
        });
        
        // Telegram loads oldest to newest in the DOM, so we reverse it to get latest first.
        items.reverse(); 

      } else {
        // Heuristic extraction: Look for Headings with Links (General Web)
        const headings = doc.querySelectorAll('h1, h2, h3, h4');
        
        headings.forEach((heading) => {
          const linkEl = heading.querySelector('a') || (heading.tagName === 'A' ? heading : null);
          
          if (linkEl && linkEl.innerText.trim().length > 15) {
            const title = linkEl.innerText.trim();
            let link = linkEl.getAttribute('href');
            if (link && !link.startsWith('http')) {
               link = new URL(link, baseUrl).href;
            }
            
            // Try to find a description (next sibling paragraph)
            let description = '';
            let sibling = heading.nextElementSibling;
            if (sibling && sibling.tagName === 'P') {
              description = sibling.innerText.trim().substring(0, 160) + '...';
            }

            // Try to find an image nearby
            let image = '';
            const parent = heading.parentElement;
            if (parent) {
               const imgEl = parent.querySelector('img');
               if (imgEl && imgEl.getAttribute('src')) {
                  let src = imgEl.getAttribute('src');
                  if (!src.startsWith('http') && !src.startsWith('data:')) {
                     src = new URL(src, baseUrl).href;
                  }
                  image = src;
               }
            }

            items.push({ id: Math.random().toString(), title, link, description, image });
          }
        });
      }
      
      // Deduplicate by link
      const uniqueItems = Array.from(new Map(items.map(item => [item.link, item])).values());
      
      if (uniqueItems.length >= 2) {
        setFeedItems(uniqueItems);
        setInfoMsg(`Successfully extracted ${uniqueItems.length} items from the page.`);
      } else {
        throw new Error("Could not automatically identify feed items.");
      }
      
    } catch (err) {
      console.warn("Parsing failed, using fallback mock data:", err);
      setFeedItems(MOCK_DATA);
      setErrorMsg("We couldn't parse that URL securely due to structure or CORS protections. Showing demo data instead so you can test the widget.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    const embedCode = `
<!-- RSS Feed Widget -->
<iframe 
  src="https://rss-widget-demo.app/embed?url=${encodeURIComponent(url || 'demo')}&layout=${config.layout}&theme=${config.theme}&color=${encodeURIComponent(config.accentColor)}&imgs=${config.showImages}&desc=${config.showDescription}&limit=${config.maxItems}&speed=${config.tickerSpeed}&chars=${config.tickerCharLimit}" 
  width="100%" 
  height="${config.layout === 'ticker' ? '60' : '500'}" 
  frameborder="0" 
  style="border-radius: 8px; border: 1px solid ${config.theme === 'dark' ? '#374151' : '#e5e7eb'};"
></iframe>
    `.trim();

    // Use a robust copy strategy for iframe environments
    const textArea = document.createElement("textarea");
    textArea.value = embedCode;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
    document.body.removeChild(textArea);
  };

  // Prepare display items
  const displayItems = feedItems.slice(0, config.maxItems);

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans">
      {/* Required CSS for Ticker Animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee ${110 - config.tickerSpeed}s linear infinite;
          ${config.tickerSpeed === 0 ? 'animation-play-state: paused !important;' : ''}
        }
        .pause-on-hover:hover .animate-marquee {
          animation-play-state: paused;
        }
        
        /* Custom Scrollbar for Preview */
        .preview-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .preview-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .preview-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 20px;
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Rss size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">FeedWeaver</h1>
          </div>
          <div className="text-sm text-gray-500 font-medium">URL to Embed Widget</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: CONTROLS */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. Data Source Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                <h2 className="font-semibold text-gray-800">Data Source</h2>
              </div>
              <div className="p-5">
                <form onSubmit={handleGenerate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/blog"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">Enter any website with articles or news listings.</p>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={isGenerating || !url}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg font-medium transition-colors"
                  >
                    {isGenerating ? (
                      <><RefreshCw size={18} className="animate-spin" /> Extracting...</>
                    ) : (
                      <><Rss size={18} /> Generate Feed</>
                    )}
                  </button>

                  {errorMsg && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-sm">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <p>{errorMsg}</p>
                    </div>
                  )}
                  {infoMsg && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-green-800 text-sm">
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                      <p>{infoMsg}</p>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* 2. Appearance Panel */}
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-opacity duration-300 ${feedItems.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                <h2 className="font-semibold text-gray-800">Customize Widget</h2>
              </div>
              
              <div className="p-5 space-y-6">
                {/* Layout Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <LayoutGrid size={16}/> Layout Style
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'list', icon: ListIcon, label: 'List' },
                      { id: 'grid', icon: LayoutGrid, label: 'Grid' },
                      { id: 'ticker', icon: MoreHorizontal, label: 'Ticker' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setConfig({ ...config, layout: type.id })}
                        className={`flex flex-col items-center justify-center gap-1 py-3 px-2 border rounded-lg transition-all ${
                          config.layout === type.id 
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' 
                            : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <type.icon size={20} />
                        <span className="text-xs font-medium">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Settings2 size={16}/> Theme
                  </label>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => setConfig({ ...config, theme: 'light' })}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${config.theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Light
                    </button>
                    <button
                      onClick={() => setConfig({ ...config, theme: 'dark' })}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${config.theme === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Dark
                    </button>
                  </div>
                </div>

                {/* Accent Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Palette size={16}/> Accent Color
                  </label>
                  <div className="flex gap-2">
                    {['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#0f172a'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setConfig({ ...config, accentColor: color })}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${config.accentColor === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                {config.layout !== 'ticker' && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2"><ImageIcon size={16}/> Show Images</span>
                      <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.showImages ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <input type="checkbox" className="sr-only" checked={config.showImages} onChange={(e) => setConfig({ ...config, showImages: e.target.checked })} />
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${config.showImages ? 'translate-x-4' : 'translate-x-1'}`} />
                      </div>
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2"><AlignLeft size={16}/> Show Descriptions</span>
                      <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.showDescription ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <input type="checkbox" className="sr-only" checked={config.showDescription} onChange={(e) => setConfig({ ...config, showDescription: e.target.checked })} />
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${config.showDescription ? 'translate-x-4' : 'translate-x-1'}`} />
                      </div>
                    </label>
                  </div>
                )}

                {/* Ticker Settings (Only for Ticker) */}
                {config.layout === 'ticker' && (
                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1"><Timer size={16}/> Scroll Speed</label>
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">{config.tickerSpeed}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={config.tickerSpeed}
                        onChange={(e) => setConfig({ ...config, tickerSpeed: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1"><AlignLeft size={16}/> Character Limit</label>
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">{config.tickerCharLimit}</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="200"
                        step="5"
                        value={config.tickerCharLimit}
                        onChange={(e) => setConfig({ ...config, tickerCharLimit: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>
                )}

                {/* Item Limit */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Max Items</label>
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">{config.maxItems}</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="15"
                    step="1"
                    value={config.maxItems}
                    onChange={(e) => setConfig({ ...config, maxItems: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

              </div>
            </div>

            {/* 3. Export Panel */}
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-opacity duration-300 ${feedItems.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                  <h2 className="font-semibold text-gray-800">Export Widget</h2>
                </div>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-600 mb-3">Copy this code and paste it into your website's HTML to embed the widget.</p>
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-300 p-4 rounded-lg text-xs overflow-x-auto border border-gray-700 select-all">
                    {`<iframe src="https://rss-widget-demo.app/embed?url=${encodeURIComponent(url || 'demo')}&layout=${config.layout}&theme=${config.theme}&color=${encodeURIComponent(config.accentColor).replace(/%/g, '%25')}&imgs=${config.showImages}&desc=${config.showDescription}&limit=${config.maxItems}&speed=${config.tickerSpeed}&chars=${config.tickerCharLimit}" width="100%" height="${config.layout === 'ticker' ? '60' : '500'}" frameborder="0" style="border-radius: 8px; border: 1px solid ${config.theme === 'dark' ? '#374151' : '#e5e7eb'};"></iframe>`}
                  </pre>
                  <button
                    onClick={handleCopyCode}
                    className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors flex items-center gap-1 text-xs"
                  >
                    {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: PREVIEW */}
          <div className="lg:col-span-8">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  Live Preview <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>
                </h2>
                <div className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded font-medium">Rendered Output</div>
              </div>

              {feedItems.length === 0 ? (
                // Empty State
                <div className="h-[500px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 flex flex-col items-center justify-center text-gray-500">
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <Code size={32} className="text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-gray-700 mb-1">No Data Yet</h3>
                  <p className="text-sm max-w-sm text-center">Enter a URL on the left and click "Generate Feed" to see your widget preview.</p>
                </div>
              ) : (
                // Widget Container
                <div className="rounded-xl overflow-hidden shadow-2xl transition-all duration-500 border border-gray-200/50 bg-white"
                     style={{
                       background: 'transparent',
                       boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
                     }}>
                  
                  {/* Fake Browser Chrome to frame it nicely */}
                  <div className="h-10 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    <div className="ml-4 flex-1 bg-white border border-gray-200 rounded text-[10px] px-2 py-1 text-gray-400 font-mono flex items-center">
                      your-website.com
                    </div>
                  </div>

                  {/* WIDGET PREVIEW ENCLOSURE */}
                  <div 
                    className={`relative w-full overflow-hidden transition-colors duration-300
                      ${config.theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800'}
                      ${config.layout !== 'ticker' ? 'h-[500px] preview-scroll overflow-y-auto p-4 sm:p-6' : 'h-16 flex items-center border-y'}
                    `}
                    style={{ borderColor: config.theme === 'dark' ? '#1e293b' : '#f1f5f9' }}
                  >
                    
                    {/* LAYOUT: LIST */}
                    {config.layout === 'list' && (
                      <div className="space-y-4">
                        {displayItems.map((item, idx) => (
                          <a 
                            key={idx} 
                            href={item.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`group flex flex-col sm:flex-row gap-4 p-4 rounded-xl border transition-all duration-200 hover:shadow-md
                              ${config.theme === 'dark' ? 'border-slate-800 hover:border-slate-700 bg-slate-800/50' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50 hover:bg-white'}
                            `}
                          >
                            {config.showImages && item.image && (
                              <div className="shrink-0 w-full sm:w-32 h-40 sm:h-24 rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700">
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => e.target.style.display = 'none'} />
                              </div>
                            )}
                            <div className="flex flex-col justify-center flex-1 min-w-0">
                              <h3 
                                className="font-semibold text-lg sm:text-base leading-tight mb-2 truncate group-hover:underline decoration-2 underline-offset-2"
                                style={{ textDecorationColor: config.accentColor }}
                              >
                                {item.title}
                              </h3>
                              {config.showDescription && item.description && (
                                <p className={`text-sm line-clamp-2 ${config.theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                                  {item.description}
                                </p>
                              )}
                              <div className="mt-2 flex items-center gap-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: config.accentColor }}>
                                Read more <ExternalLink size={12} />
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* LAYOUT: GRID */}
                    {config.layout === 'grid' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                        {displayItems.map((item, idx) => (
                          <a 
                            key={idx} 
                            href={item.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`group flex flex-col h-full rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg
                              ${config.theme === 'dark' ? 'border-slate-800 hover:border-slate-700 bg-slate-800/50' : 'border-gray-100 hover:border-gray-200 bg-white'}
                            `}
                          >
                            {config.showImages && item.image ? (
                              <div className="w-full h-36 overflow-hidden bg-gray-200 dark:bg-slate-700 border-b border-inherit">
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => e.target.style.display = 'none'} />
                              </div>
                            ) : config.showImages && !item.image ? (
                               <div className="w-full h-24 bg-gradient-to-br opacity-50 border-b border-inherit" style={{ from: config.theme === 'dark' ? '#1e293b' : '#f1f5f9', to: config.accentColor }}></div>
                            ) : null}
                            
                            <div className="p-4 flex flex-col flex-1">
                              <h3 
                                className="font-bold text-sm leading-snug mb-2 group-hover:underline decoration-2 underline-offset-2 line-clamp-2"
                                style={{ textDecorationColor: config.accentColor }}
                              >
                                {item.title}
                              </h3>
                              {config.showDescription && item.description && (
                                <p className={`text-xs mt-auto line-clamp-3 ${config.theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* LAYOUT: TICKER */}
                    {config.layout === 'ticker' && (
                      <div className="w-full h-full flex items-center overflow-hidden pause-on-hover relative">
                        {/* Left Gradient Fade */}
                        <div className={`absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r ${config.theme === 'dark' ? 'from-slate-900 to-transparent' : 'from-white to-transparent'}`}></div>
                        
                        {/* We use two identical blocks for seamless infinite scrolling */}
                        <div className="flex animate-marquee shrink-0 items-center">
                          {displayItems.concat(displayItems).map((item, idx) => {
                            const truncatedTitle = item.title.length > config.tickerCharLimit 
                              ? item.title.substring(0, config.tickerCharLimit) + '...' 
                              : item.title;
                            return (
                              <a 
                                key={`t1-${idx}`} 
                                href={item.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-6 whitespace-nowrap group"
                              >
                                <span className="w-2 h-2 rounded-full mr-3 shrink-0" style={{ backgroundColor: config.accentColor }}></span>
                                <span className="font-medium text-sm hover:underline decoration-2 underline-offset-4" style={{ textDecorationColor: config.accentColor }}>
                                  {truncatedTitle}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                        <div className="flex animate-marquee shrink-0 items-center" aria-hidden="true">
                          {displayItems.concat(displayItems).map((item, idx) => {
                            const truncatedTitle = item.title.length > config.tickerCharLimit 
                              ? item.title.substring(0, config.tickerCharLimit) + '...' 
                              : item.title;
                            return (
                              <a 
                                key={`t2-${idx}`} 
                                href={item.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-6 whitespace-nowrap group"
                              >
                                <span className="w-2 h-2 rounded-full mr-3 shrink-0" style={{ backgroundColor: config.accentColor }}></span>
                                <span className="font-medium text-sm hover:underline decoration-2 underline-offset-4" style={{ textDecorationColor: config.accentColor }}>
                                  {truncatedTitle}
                                </span>
                              </a>
                            );
                          })}
                        </div>

                        {/* Right Gradient Fade */}
                        <div className={`absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l ${config.theme === 'dark' ? 'from-slate-900 to-transparent' : 'from-white to-transparent'}`}></div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
