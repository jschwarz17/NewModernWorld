import React, { useState, useEffect } from 'react';
import Globe from 'react-globe.gl';
import axios from 'axios';

const GEO_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const API_KEY = import.meta.env.VITE_GROK_PART1 + import.meta.env.VITE_GROK_PART2;
const CONTINENTS = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

function App() {
  const [geoData, setGeoData] = useState(null);
  const [selectedContinent, setSelectedContinent] = useState(null);
  const [content, setContent] = useState({ period: '', paragraph: '', questions: [] });
  const [answers, setAnswers] = useState({});
  const [showMoveAhead, setShowMoveAhead] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [timerActive, setTimerActive] = useState(false);
  const [error, setError] = useState(null);
  
  // Track if we are on mobile (less than 768px wide)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [progress, setProgress] = useState(() => {
    const saved = localStorage.getItem('history_progress');
    return saved ? JSON.parse(saved) : CONTINENTS.reduce((acc, cont) => ({ ...acc, [cont]: 1500 }), {});
  });

  useEffect(() => {
    localStorage.setItem('history_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    let timer;
    if (timerActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);
      setShowMoveAhead(true);
    }
    return () => clearInterval(timer);
  }, [timerActive, timeLeft]);

  // Updated sizing logic for responsive layout
  const [dimensions, setDimensions] = useState({
    width: isMobile ? window.innerWidth : window.innerWidth / 2,
    height: isMobile ? window.innerHeight / 2 : window.innerHeight
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setDimensions({
        width: mobile ? window.innerWidth : window.innerWidth / 2,
        height: mobile ? window.innerHeight / 2 : window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  useEffect(() => {
    fetch(GEO_URL).then(res => res.json()).then(data => setGeoData(data));
  }, []);

  const getPolygonColor = (d) => {
    const continent = d.properties?.CONTINENT || d.properties?.continent || '';
    if (continent === selectedContinent) return 'rgba(255, 165, 0, 0.9)'; 
    const year = progress[continent] || 1500;
    const opacity = Math.max(0.1, Math.min(0.7, (year - 1500) / 500));
    return `rgba(30, 144, 255, ${opacity})`;
  };

  const handleContinentClick = (polygon) => {
    const continent = polygon.properties?.CONTINENT || polygon.properties?.continent || polygon.properties?.REGION_UN;
    if (continent && CONTINENTS.includes(continent)) {
      setSelectedContinent(continent);
      setAnswers({});
      setShowMoveAhead(false);
      setTimeLeft(60);
      setTimerActive(false);
      setContent({ period: '', paragraph: '', questions: [] });
      setError(null);
      fetchHistory(progress[continent] || 1500, continent);
      
      // On mobile, scroll up to the text area automatically
      if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fetchHistory = async (year, continentName) => {
    setLoading(true);
    setError(null);
    const endYear = year + 50;
    
    // Check if API key is available
    if (!API_KEY || API_KEY === 'undefinedundefined') {
      setError('API key not configured. Please check your environment variables.');
      setLoading(false);
      return;
    }

    const prompt = `You are a world-class historian. Write a short factual paragraph about historical events in ${continentName} strictly between ${year} and ${endYear}. Format strictly with: Time Period: ${year}-${endYear}, [paragraph], and 3 Multiple Choice Questions with A/B/C/D and Correct: [letter].`;

    try {
      const res = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-4-1-fast-non-reasoning',
        messages: [{ role: 'user', content: prompt }]
      }, { headers: { Authorization: `Bearer ${API_KEY}` } });

      const text = res?.data?.choices?.[0]?.message?.content?.trim() || '';
      
      if (!text) {
        setError('No response received from API. Please try again.');
        setLoading(false);
        return;
      }

      // More flexible parsing - handle different formats
      let period = '';
      let paragraph = '';
      let questions = [];

      // Try to extract time period
      const periodMatch = text.match(/Time Period:\s*(\d+-\d+)/i);
      if (periodMatch) {
        period = periodMatch[1];
      }

      // Split by double newlines or look for paragraph
      const parts = text.split(/\n\n+/);
      
      // Find the paragraph (usually after time period, before questions)
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part && !part.match(/^Time Period:/i) && !part.match(/^Question \d+:/i) && !part.match(/^[A-D]\)/)) {
          paragraph = part;
          break;
        }
      }

      // Extract questions
      const questionBlocks = text.split(/Question \d+:/i).slice(1);
      questions = questionBlocks.map(qtext => {
        const lines = qtext.split('\n').filter(l => l.trim());
        if (lines.length < 5) return null;
        
        const question = lines[0].trim();
        const options = lines.slice(1, 5).map(l => l.trim().replace(/^[A-D][).]\s*/, ''));
        const correctLine = lines.find(l => l.match(/Correct:/i));
        const correct = correctLine ? correctLine.split(/:/i)[1]?.trim() : '';
        
        return { question, options, correct };
      }).filter(q => q && q.question && q.correct && q.options.length === 4);

      if (!paragraph && !period) {
        // Fallback: use the whole text as paragraph if parsing fails
        paragraph = text.split(/Question \d+:/i)[0].replace(/Time Period:.*/i, '').trim();
      }

      if (paragraph || period || questions.length > 0) {
        setContent({ period, paragraph, questions });
        setTimerActive(true);
      } else {
        setError('Could not parse API response. Please try again.');
      }
    } catch (e) {
      console.error('API Error:', e);
      const errorMessage = e.response?.data?.error?.message || e.message || 'Failed to fetch history. Please check your API key and try again.';
      setError(errorMessage);
    }
    setLoading(false);
  };

  const handleAnswer = (i, letter) => {
    if (timeLeft === 0 || answers[i]) return; 
    const isCorrect = letter === content.questions[i].correct;
    const newAnswers = { ...answers, [i]: { selected: letter, isCorrect } };
    setAnswers(newAnswers);
    if (Object.keys(newAnswers).length === content.questions.length) {
      setShowMoveAhead(true);
      setTimerActive(false);
    }
  };

  const handleMoveAhead = () => {
    const nextYear = progress[selectedContinent] + 50;
    setProgress(prev => ({ ...prev, [selectedContinent]: nextYear }));
    setAnswers({});
    setShowMoveAhead(false);
    setTimeLeft(60); 
    setContent({ period: '', paragraph: '', questions: [] });
    fetchHistory(nextYear, selectedContinent);
  };

  if (!geoData) return <div style={{background: '#000', color: '#fff', height: '100vh', padding: '20px'}}>Loading...</div>;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: isMobile ? 'column' : 'row', // Stacks on mobile
      height: '100vh', 
      width: '100vw', 
      backgroundColor: '#000', 
      overflowX: 'hidden' 
    }}>
      {/* LEFT/TOP: QUIZ PANEL */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? 'auto' : '100vh',
        padding: '20px', 
        overflowY: 'auto', 
        backgroundColor: '#111', 
        color: '#fff', 
        borderBottom: isMobile ? '2px solid #333' : 'none',
        borderRight: isMobile ? 'none' : '2px solid #333',
        boxSizing: 'border-box' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{fontSize: isMobile ? '20px' : '24px'}}>History Explorer</h1>
          {timerActive && (
            <div style={{ padding: '8px 15px', backgroundColor: timeLeft < 10 ? '#c0392b' : '#333', borderRadius: '20px', fontWeight: 'bold' }}>
              ⏱ {timeLeft}s
            </div>
          )}
        </div>

        {loading ? <p>Loading Era...</p> : selectedContinent ? (
          <div>
            {error && (
              <div style={{ padding: '15px', background: '#c0392b', borderRadius: '8px', marginBottom: '15px' }}>
                <p style={{ color: '#fff', fontWeight: 'bold', margin: 0 }}>Error: {error}</p>
                <button onClick={() => fetchHistory(progress[selectedContinent] || 1500, selectedContinent)} 
                  style={{ marginTop: '10px', padding: '8px 15px', background: '#fff', color: '#c0392b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            )}
            <h3 style={{ color: '#3498db' }}>{selectedContinent}{content.period ? `: ${content.period}` : ''}</h3>
            {timeLeft === 0 && <p style={{ color: '#c0392b', fontWeight: 'bold' }}>TIME'S UP!</p>}
            {content.paragraph ? (
              <p style={{lineHeight: '1.6', fontSize: isMobile ? '16px' : '18px'}}>{content.paragraph}</p>
            ) : !error && !loading && (
              <p style={{ color: '#888' }}>Loading content...</p>
            )}
            
            {content.questions.map((q, i) => (
              <div key={i} style={{margin: '15px 0', padding: '15px', background: '#222', borderRadius: '8px'}}>
                <p><strong>{q.question}</strong></p>
                {q.options.map((opt, j) => {
                  const letter = ['A', 'B', 'C', 'D'][j];
                  const ans = answers[i];
                  const isAnswered = !!ans;
                  const isCorrectBtn = letter === q.correct;
                  const isSelectedBtn = ans?.selected === letter;

                  let btnColor = '#333';
                  if (isAnswered || timeLeft === 0) {
                    if (isCorrectBtn) btnColor = '#27ae60';
                    else if (isSelectedBtn && !ans.isCorrect) btnColor = '#c0392b';
                  }

                  return (
                    <button key={j} onClick={() => handleAnswer(i, letter)} disabled={isAnswered || timeLeft === 0} style={{
                      display: 'block', width: '100%', textAlign: 'left', margin: '8px 0', padding: '12px',
                      background: btnColor, color: '#fff', border: 'none', borderRadius: '6px', 
                      fontSize: '14px', cursor: (isAnswered || timeLeft === 0) ? 'default' : 'pointer'
                    }}>
                      {letter}) {opt} {isAnswered && isCorrectBtn && ' ✓'} {isSelectedBtn && !ans.isCorrect && ' ✗'}
                    </button>
                  );
                })}
              </div>
            ))}
            {showMoveAhead && <button onClick={handleMoveAhead} style={{width: '100%', padding: '15px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold', marginBottom: '20px'}}>Next Era →</button>}
          </div>
        ) : <p style={{ color: '#888' }}>Select a continent on the globe below to begin.</p>}
      </div>

      {/* RIGHT/BOTTOM: GLOBE PANEL */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? '50vh' : '100vh',
        backgroundColor: '#000'
      }}>
        <Globe 
          width={dimensions.width} 
          height={dimensions.height} 
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg" 
          backgroundColor="#000" 
          polygonsData={geoData.features} 
          polygonCapColor={getPolygonColor} 
          onPolygonClick={handleContinentClick} 
        />
      </div>
    </div>
  );
}

export default App;