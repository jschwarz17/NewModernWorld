import React, { useState, useEffect } from 'react';
import Globe from 'react-globe.gl';
import axios from 'axios';

const GEO_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const API_KEY = import.meta.env.VITE_GROK_PART1 + import.meta.env.VITE_GROK_PART2;
const CONTINENTS = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

// Helper function to scramble a name
const scrambleName = (name) => {
  return name.split('').reverse().join('');
};

function App() {
  console.log('🚀 App component loaded!');
  const [geoData, setGeoData] = useState(null);
  const [selectedContinent, setSelectedContinent] = useState(null);
  const [content, setContent] = useState({ period: '', paragraph: '', questions: [] });
  const [answers, setAnswers] = useState({});
  const [showMoveAhead, setShowMoveAhead] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [timerActive, setTimerActive] = useState(false);
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showNameInput, setShowNameInput] = useState(false);
  const [userName, setUserName] = useState(() => {
    const saved = localStorage.getItem('history_userName');
    return saved || '';
  });
  const [scrambledName, setScrambledName] = useState(() => {
    const saved = localStorage.getItem('history_scrambledName');
    return saved || '';
  });
  const [hasCompletedFirstRound, setHasCompletedFirstRound] = useState(() => {
    const saved = localStorage.getItem('history_firstRoundComplete');
    return saved === 'true';
  });
  const [continentScores, setContinentScores] = useState(() => {
    const saved = localStorage.getItem('history_continentScores');
    return saved ? JSON.parse(saved) : {};
  });

  const [progress, setProgress] = useState(() => {
    const saved = localStorage.getItem('history_progress');
    return saved ? JSON.parse(saved) : CONTINENTS.reduce((acc, cont) => ({ ...acc, [cont]: 1500 }), {});
  });

  useEffect(() => {
    localStorage.setItem('history_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    if (userName) {
      localStorage.setItem('history_userName', userName);
    }
  }, [userName]);

  useEffect(() => {
    if (scrambledName) {
      localStorage.setItem('history_scrambledName', scrambledName);
    }
  }, [scrambledName]);

  useEffect(() => {
    localStorage.setItem('history_firstRoundComplete', hasCompletedFirstRound.toString());
  }, [hasCompletedFirstRound]);

  useEffect(() => {
    localStorage.setItem('history_continentScores', JSON.stringify(continentScores));
  }, [continentScores]);

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
    console.log('🌍 Fetching geo data from:', GEO_URL);
    fetch(GEO_URL)
      .then(res => res.json())
      .then(data => {
        console.log('✅ Geo data loaded, features:', data.features?.length);
        setGeoData(data);
      })
      .catch(err => {
        console.error('❌ Error loading geo data:', err);
      });
  }, []);

  const getPolygonColor = (d) => {
    const continent = d.properties?.CONTINENT || d.properties?.continent || '';
    
    // Highlight selected continent
    if (continent === selectedContinent) return 'rgba(255, 165, 0, 0.9)';
    
    // Get score for this continent (number of time periods with 2+ correct answers)
    const scoredPeriods = continentScores[continent] || [];
    const score = scoredPeriods.length;
    
    // Base color based on progress year
    const year = progress[continent] || 1500;
    const baseOpacity = Math.max(0.1, Math.min(0.7, (year - 1500) / 500));
    
    // Add color intensity based on score (light green shading that gets darker)
    // Score 0: no extra color
    // Score 1+: light green (rgba(46, 204, 113, ...)) that gets darker with more scores
    if (score > 0) {
      // Light green shading: start at 0.2 opacity, increase by 0.15 per score level
      const greenOpacity = Math.min(0.8, 0.2 + (score * 0.15));
      return `rgba(46, 204, 113, ${greenOpacity})`;
    }
    
    // Default blue color based on progress
    return `rgba(30, 144, 255, ${baseOpacity})`;
  };

  const handleContinentClick = (polygon) => {
    console.log('🔵 Continent clicked!', polygon);
    const continent = polygon.properties?.CONTINENT || polygon.properties?.continent || polygon.properties?.REGION_UN;
    console.log('🔵 Extracted continent:', continent);
    console.log('🔵 Valid continents:', CONTINENTS);
    console.log('🔵 Is valid?', continent && CONTINENTS.includes(continent));
    
    if (continent && CONTINENTS.includes(continent)) {
      console.log('✅ Valid continent selected, calling fetchHistory...');
      setSelectedContinent(continent);
      setAnswers({});
      setShowMoveAhead(false);
      setTimeLeft(60);
      setTimerActive(false);
      setContent({ period: '', paragraph: '', questions: [] });
      setError(null);
      const year = progress[continent] || 1500;
      console.log('🔵 Calling fetchHistory with:', { year, continent });
      fetchHistory(year, continent);
      if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      console.warn('❌ Invalid continent or not in list:', continent);
    }
  };

  const fetchHistory = async (year, continentName) => {
    console.log('🚀 fetchHistory called with:', { year, continentName });
    setLoading(true);
    setError(null);
    const endYear = year + 50;

    console.log('🔑 API_KEY check:', API_KEY ? 'Present' : 'Missing', API_KEY?.substring(0, 10) + '...');
    if (!API_KEY || API_KEY.includes('undefined')) {
      console.error('❌ API key not configured!');
      setError('API key not configured properly.');
      setLoading(false);
      return;
    }
    console.log('✅ API key is present, proceeding with API call...');

    // UPDATED PROMPT: Requesting structured JSON
    const prompt = `You are a world-class historian. Write a factual paragraph (exactly 150 words) about historical events in ${continentName} between ${year} and ${endYear}. 
    
    Return ONLY a JSON object with this exact structure:
    {
      "period": "${year}-${endYear}",
      "paragraph": "Your 150-word history paragraph here",
      "questions": [
        {
          "question": "Question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correct": "A"
        }
      ]
    }
    Include exactly 3 questions. Do not include any text outside of the JSON object.`;

    try {
      console.log('Making API call...');
      const res = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-4-1-fast-non-reasoning',
        messages: [{ role: 'user', content: prompt }]
      }, { 
        headers: { 
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        } 
      });

      console.log('API call successful, status:', res.status);
      let rawText = res?.data?.choices?.[0]?.message?.content?.trim() || '';
      console.log('Raw API response length:', rawText.length);
      console.log('Raw API response preview:', rawText.substring(0, 200));
      
      if (!rawText) {
        throw new Error('Empty response from API');
      }
      
      // Remove potential markdown code blocks if the AI adds them
      const cleanJson = rawText.replace(/```json|```/g, '').trim();
      console.log('Cleaned JSON preview:', cleanJson.substring(0, 200));
      
      let data;
      try {
        data = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Failed to parse:', cleanJson);
        throw new Error(`Failed to parse JSON: ${parseError.message}. Response: ${cleanJson.substring(0, 300)}`);
      }

      console.log('Parsed data:', { 
        period: data.period, 
        paragraphLength: data.paragraph?.length, 
        questionsCount: data.questions?.length 
      });

      setContent({
        period: data.period || `${year}-${endYear}`,
        paragraph: data.paragraph || '',
        questions: data.questions || []
      });

      if (data.questions?.length > 0) {
        setTimerActive(true);
        console.log('Questions loaded successfully:', data.questions.length);
      } else {
        console.warn('No questions in response:', data);
      }
    } catch (e) {
      console.error('API or Parsing Error:', e);
      console.error('Error details:', {
        message: e.message,
        response: e.response?.data,
        status: e.response?.status,
        statusText: e.response?.statusText
      });
      
      if (e.response?.status === 401) {
        setError('API key is invalid or expired. Please check your API key.');
      } else if (e.response?.status === 403) {
        setError('Access forbidden. This may be a CORS issue. Check browser console for details.');
      } else if (e.code === 'ERR_NETWORK' || e.message?.includes('CORS')) {
        setError('Network error or CORS issue. The API request may be blocked. Check browser console.');
      } else {
        setError(`Failed to load history: ${e.message || 'Unknown error'}. Check console for details.`);
      }
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
      
      // Count correct answers
      const correctCount = Object.values(newAnswers).filter(a => a.isCorrect).length;
      
      // If 2+ correct answers, increment score for this continent/time period
      if (correctCount >= 2 && selectedContinent) {
        const periodKey = `${selectedContinent}_${content.period}`;
        setContinentScores(prev => {
          const newScores = { ...prev };
          // Track which periods have been scored
          if (!newScores[selectedContinent]) {
            newScores[selectedContinent] = [];
          }
          // Only increment if we haven't already scored this period
          if (!newScores[selectedContinent].includes(periodKey)) {
            newScores[selectedContinent] = [...newScores[selectedContinent], periodKey];
          }
          return newScores;
        });
      }
      
      // Check if this is the first completed round
      if (!hasCompletedFirstRound && selectedContinent) {
        setHasCompletedFirstRound(true);
        if (!userName) {
          setShowNameInput(true);
        }
      }
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

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const name = input.value.trim();
    if (name) {
      const scrambled = scrambleName(name);
      setUserName(name);
      setScrambledName(scrambled);
      setShowNameInput(false);
      // Show a brief message
      alert(`Ok, we'll call you ${scrambled}.`);
    }
  };

  if (!geoData) return <div style={{background: '#000', color: '#fff', height: '100vh', padding: '20px'}}>Loading Map...</div>;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: isMobile ? 'column' : 'row', 
      height: '100vh', 
      width: '100vw', 
      backgroundColor: '#000', 
      overflowX: 'hidden' 
    }}>
      {/* FIXED HEADER */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        backgroundColor: '#111',
        borderBottom: '2px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 30px',
        zIndex: 1000,
        boxSizing: 'border-box'
      }}>
        <h1 style={{fontSize: isMobile ? '20px' : '24px', margin: 0, color: '#fff'}}>History Explorer</h1>
        {scrambledName && (
          <div style={{ fontSize: isMobile ? '14px' : '16px', color: '#888' }}>
            User: <span style={{ fontWeight: 'bold', color: '#fff' }}>{scrambledName}</span>
          </div>
        )}
      </div>

      {/* LEFT PANEL: CONTENT */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? 'auto' : '100vh',
        padding: '30px',
        paddingTop: '90px', // Account for fixed header
        overflowY: 'auto', 
        backgroundColor: '#111', 
        color: '#fff', 
        borderBottom: isMobile ? '2px solid #333' : 'none',
        borderRight: isMobile ? 'none' : '2px solid #333',
        boxSizing: 'border-box' 
      }}>

        {loading ? (
          <p>Loading Era...</p>
        ) : selectedContinent ? (
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
            <h3 style={{ color: '#3498db', marginBottom: '20px' }}>{selectedContinent}{content.period ? `: ${content.period}` : ''}</h3>
            {timeLeft === 0 && <p style={{ color: '#c0392b', fontWeight: 'bold', marginBottom: '15px' }}>TIME'S UP!</p>}
            {content.paragraph ? (
              <p style={{lineHeight: '1.6', fontSize: isMobile ? '16px' : '18px', marginBottom: '30px'}}>{content.paragraph}</p>
            ) : !error && !loading && (
              <p style={{ color: '#888' }}>Loading content...</p>
            )}
            
            {content.questions && content.questions.length > 0 ? (
              content.questions.map((q, i) => (
                <div key={i} style={{margin: '20px 0', padding: '20px', background: '#222', borderRadius: '8px'}}>
                  <p style={{fontSize: '18px', fontWeight: 'bold', marginBottom: '15px'}}>{q.question}</p>
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
                        display: 'block', width: '100%', textAlign: 'left', margin: '10px 0', padding: '15px',
                        background: btnColor, color: '#fff', border: 'none', borderRadius: '6px', 
                        fontSize: '16px', cursor: (isAnswered || timeLeft === 0) ? 'default' : 'pointer',
                        transition: 'background 0.2s'
                      }}>
                        {letter}) {opt} {isAnswered && isCorrectBtn && ' ✓'} {isSelectedBtn && !ans.isCorrect && ' ✗'}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : !loading && !error && content.paragraph && (
              <div style={{ marginTop: '20px', padding: '15px', background: '#222', borderRadius: '8px' }}>
                <p style={{ color: '#888', fontStyle: 'italic' }}>Questions are being generated...</p>
              </div>
            )}
            {showMoveAhead && (
              <button onClick={handleMoveAhead} style={{
                width: '100%', padding: '15px', background: '#0d6efd', color: '#fff', 
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', 
                fontWeight: 'bold', marginTop: '20px', marginBottom: '20px'
              }}>
                Next Era →
              </button>
            )}
          </div>
        ) : (
          <p style={{ color: '#888' }}>Spin the globe and pick a continent</p>
        )}
      </div>

      {/* RIGHT PANEL: GLOBE */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? '50vh' : '100vh',
        backgroundColor: '#000',
        position: 'relative'
      }}>
        {/* Timer - moved to globe panel */}
        {timerActive && (
          <div style={{ 
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '8px 15px', 
            backgroundColor: timeLeft < 10 ? '#c0392b' : '#333', 
            borderRadius: '20px', 
            fontWeight: 'bold',
            zIndex: 1000,
            color: '#fff'
          }}>
            ⏱ {timeLeft}s
          </div>
        )}
        
        {/* Globe container */}
        {geoData && geoData.features ? (
          <Globe 
            width={dimensions.width} 
            height={dimensions.height} 
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg" 
            backgroundColor="#000" 
            polygonsData={geoData.features} 
            polygonCapColor={getPolygonColor} 
            onPolygonClick={(polygon) => {
              console.log('🌐 Globe onPolygonClick triggered!', polygon);
              handleContinentClick(polygon);
            }} 
          />
        ) : (
          <div style={{ color: '#fff', padding: '20px' }}>Loading globe...</div>
        )}
      </div>
      
      {/* Name Input Modal */}
      {showNameInput && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#222',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h2 style={{ color: '#fff', marginTop: 0, marginBottom: '20px' }}>What's your name?</h2>
            <form onSubmit={handleNameSubmit}>
              <input
                type="text"
                placeholder="Enter your name"
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  borderRadius: '6px',
                  border: '1px solid #444',
                  backgroundColor: '#333',
                  color: '#fff',
                  marginBottom: '15px',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  backgroundColor: '#0d6efd',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
