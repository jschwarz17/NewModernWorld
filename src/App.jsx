import React, { useState, useEffect } from 'react';
import Globe from 'react-globe.gl';
import axios from 'axios';

const GEO_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const API_KEY = import.meta.env.VITE_GROK_PART1 + import.meta.env.VITE_GROK_PART2;
const CONTINENTS = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

function App() {
  console.log('App component loaded');
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
    console.log('Continent clicked:', continent);
    if (continent && CONTINENTS.includes(continent)) {
      console.log('Valid continent, fetching history...');
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
    } else {
      console.log('Invalid continent or not in CONTINENTS list:', continent);
    }
  };

  const fetchHistory = async (year, continentName) => {
    console.log('fetchHistory called with:', { year, continentName });
    setLoading(true);
    setError(null);
    const endYear = year + 50;
    
    // Check if API key is available
    console.log('API_KEY check:', API_KEY ? 'Present' : 'Missing', API_KEY?.substring(0, 10) + '...');
    if (!API_KEY || API_KEY === 'undefinedundefined') {
      console.error('API key not configured!');
      setError('API key not configured. Please check your environment variables.');
      setLoading(false);
      return;
    }

    const prompt = `You are a world-class historian. Write a factual paragraph (exactly 150 words) about historical events in ${continentName} strictly between ${year} and ${endYear}. 

Format your response EXACTLY as follows:

Time Period: ${year}-${endYear}

[Your 150-word paragraph here]

Question 1: [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [A, B, C, or D]

Question 2: [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [A, B, C, or D]

Question 3: [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [A, B, C, or D]`;

    try {
      console.log('Making API call to grok-4-1-fast-non-reasoning...');
      const res = await axios.post('https://api.x.ai/v1/chat/completions', {
        model: 'grok-4-1-fast-non-reasoning', // Using grok-4-1-fast-non-reasoning model
        messages: [{ role: 'user', content: prompt }]
      }, { headers: { Authorization: `Bearer ${API_KEY}` } });
      console.log('API call successful, status:', res.status);

      const text = res?.data?.choices?.[0]?.message?.content?.trim() || '';
      
      // Log full response for debugging
      console.log('=== FULL API RESPONSE ===');
      console.log(text);
      console.log('Response length:', text.length);
      console.log('=== END API RESPONSE ===');
      
      if (!text) {
        setError('No response received from API. Please try again.');
        setLoading(false);
        return;
      }

      // Parse the response
      let period = '';
      let paragraph = '';
      let questions = [];

      // Extract time period
      const periodMatch = text.match(/Time Period:\s*(\d+-\d+)/i);
      if (periodMatch) {
        period = periodMatch[1];
      }

      // Extract paragraph - everything between Time Period and first Question
      const paragraphMatch = text.match(/Time Period:.*?\n\n(.*?)(?=\n\nQuestion \d+:|$)/is);
      if (paragraphMatch) {
        paragraph = paragraphMatch[1].trim();
      } else {
        // Fallback: get text between Time Period and first Question
        const questionStart = text.search(/Question \d+:/i);
        if (questionStart > 0) {
          paragraph = text.substring(0, questionStart)
            .replace(/Time Period:.*?\n\n?/i, '')
            .trim();
        } else {
          // Last resort: everything after Time Period
          paragraph = text.replace(/Time Period:.*?\n\n?/i, '').trim();
        }
      }

      // Improved question extraction - handle multiple formats
      // Method 1: Split by "Question" keyword
      const questionSections = text.split(/(?=Question \d+:)/i).filter(section => 
        section.trim().match(/Question \d+:/i)
      );
      
      console.log('Found question sections:', questionSections.length);
      
      questions = questionSections.map((section, idx) => {
        const lines = section.split(/\n/).map(l => l.trim()).filter(l => l && !l.match(/^Time Period:/i));
        
        // Find question text - line with "Question X:"
        let questionText = '';
        const questionLineIndex = lines.findIndex(l => l.match(/Question \d+:/i));
        if (questionLineIndex >= 0) {
          questionText = lines[questionLineIndex].replace(/Question \d+:\s*/i, '').trim();
        }
        
        // Extract all options (A), B), C), D))
        const options = [];
        const optionLines = lines.filter(l => l.match(/^[A-D][).]\s/));
        optionLines.forEach(line => {
          const match = line.match(/^[A-D][).]\s*(.+)$/i);
          if (match) {
            options.push(match[1].trim());
          }
        });
        
        // Extract correct answer
        let correct = '';
        const correctLine = lines.find(l => l.match(/Correct:\s*([A-D])/i));
        if (correctLine) {
          const match = correctLine.match(/Correct:\s*([A-D])/i);
          correct = match ? match[1].toUpperCase() : '';
        }
        
        console.log(`Question ${idx + 1}:`, { questionText, optionsCount: options.length, correct });
        
        if (questionText && options.length >= 4 && correct) {
          return { 
            question: questionText, 
            options: options.slice(0, 4), // Ensure exactly 4 options
            correct 
          };
        }
        return null;
      }).filter(q => q !== null && q.question && q.options.length === 4 && q.correct);
      
      console.log('Final parsed questions:', questions.length, questions);

      // Log for debugging (remove in production if needed)
      console.log('Parsed content:', { period, paragraph: paragraph.substring(0, 50) + '...', questionsCount: questions.length });
      
      if (paragraph || period) {
        setContent({ period, paragraph, questions });
        if (questions.length > 0) {
          setTimerActive(true);
        } else {
          console.warn('No questions parsed from response');
          // Still show content even if questions failed to parse
          setTimerActive(false);
        }
      } else {
        setError('Could not parse API response. Please try again.');
        console.error('Full API response:', text);
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
          <div style={{ padding: '5px 10px', background: '#ff0000', color: '#fff', borderRadius: '4px', fontSize: '10px' }}>
            v3ee54e6
          </div>
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
              <p style={{lineHeight: '1.6', fontSize: isMobile ? '16px' : '18px', marginBottom: '20px'}}>{content.paragraph}</p>
            ) : !error && !loading && (
              <p style={{ color: '#888' }}>Loading content...</p>
            )}
            
            {/* Debug info - always visible - TEST VERSION */}
            <div style={{ padding: '15px', background: '#ff6b6b', borderRadius: '8px', marginBottom: '15px', fontSize: '14px', border: '2px solid #fff', color: '#fff' }}>
              <strong>🔍 DEBUG BOX - IF YOU SEE THIS, CODE IS RUNNING</strong>
              <div style={{ marginTop: '10px' }}>
                Questions found: <strong style={{ fontSize: '18px' }}>{content.questions?.length || 0}</strong>
              </div>
              <div style={{ marginTop: '10px', padding: '10px', background: '#333', borderRadius: '4px' }}>
                <strong style={{ color: '#3498db' }}>Debug Info:</strong>
                <div style={{ marginTop: '5px', color: '#fff' }}>
                  Questions found: <strong>{content.questions?.length || 0}</strong>
                </div>
                {content.questions && content.questions.length > 0 ? (
                  <div style={{ marginTop: '10px' }}>
                    {content.questions.map((q, idx) => (
                      <div key={idx} style={{ marginBottom: '5px', padding: '5px', background: '#222' }}>
                        <div>Q{idx + 1}: {q.question?.substring(0, 50)}...</div>
                        <div style={{ fontSize: '11px', color: '#aaa' }}>
                          Options: {q.options?.length || 0}, Correct: {q.correct || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: '5px', color: '#c0392b' }}>
                    No questions parsed. Check browser console (F12) for API response.
                  </div>
                )}
              </div>
            </div>
            
            {content.questions && content.questions.length > 0 ? (
              content.questions.map((q, i) => (
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
              ))
            ) : !loading && !error && content.paragraph && (
              <div style={{ marginTop: '20px', padding: '15px', background: '#222', borderRadius: '8px' }}>
                <p style={{ color: '#888', fontStyle: 'italic' }}>Questions are being generated...</p>
                <p style={{ color: '#c0392b', fontSize: '12px', marginTop: '10px' }}>
                  Debug: No questions found. Check console (F12) for API response details.
                </p>
              </div>
            )}
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