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
      {/* LEFT PANEL: CONTENT */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? 'auto' : '100vh',
        padding: '30px',
        overflowY: 'auto', 
        backgroundColor: '#111', 
        color: '#fff', 
        borderBottom: isMobile ? '2px solid #333' : 'none',
        borderRight: isMobile ? 'none' : '2px solid #333',
        boxSizing: 'border-box' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{fontSize: isMobile ? '20px' : '24px', margin: 0}}>History Explorer</h1>
          {timerActive && (
            <div style={{ padding: '8px 15px', backgroundColor: timeLeft < 10 ? '#c0392b' : '#333', borderRadius: '20px', fontWeight: 'bold' }}>
              ⏱ {timeLeft}s
            </div>
          )}
        </div>

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
          <p style={{ color: '#888' }}>Select a continent on the globe to begin.</p>
        )}
      </div>

      {/* RIGHT PANEL: GLOBE */}
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
