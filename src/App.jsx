import React, { useState, useEffect, useRef } from 'react';
import Globe from 'react-globe.gl';
import axios from 'axios';

const GEO_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const API_KEY = import.meta.env.VITE_GROK_PART1 + import.meta.env.VITE_GROK_PART2;
const CONTINENTS = ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Australia', 'South America'];

// Levels system (max score with 30% bonus: 1,845 points)
const LEVELS = [
  { name: 'time tourist (newbie)', minPoints: 0, maxPoints: 100 },
  { name: 'history hiker', minPoints: 101, maxPoints: 300 },
  { name: 'past pathfinder', minPoints: 301, maxPoints: 600 },
  { name: 'era explorer', minPoints: 601, maxPoints: 900 },
  { name: 'chronology connoisseur', minPoints: 901, maxPoints: 1200 },
  { name: 'timeline titan', minPoints: 1201, maxPoints: 1350 },
  { name: 'history hero', minPoints: 1351, maxPoints: 1845 }
];

// Continent diversity bonus tiers (percentage)
const CONTINENT_BONUS_TIERS = {
  1: 0,      // 1 continent: 0% bonus
  2: 5,      // 2 continents: +5% bonus
  3: 10,     // 3 continents: +10% bonus
  4: 15,     // 4 continents: +15% bonus
  5: 20,     // 5 continents: +20% bonus
  6: 25,     // 6 continents: +25% bonus
  7: 30      // 7 continents: +30% bonus (all continents)
};

// Helper function to scramble a name randomly
const scrambleName = (name) => {
  const chars = name.split('');
  // Fisher-Yates shuffle algorithm
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

// Helper function to calculate total score with bonus
const calculateTotalScore = (continentScores) => {
  let baseScore = 0;
  let continentsPlayed = 0;
  
  CONTINENTS.forEach(continent => {
    const periods = continentScores[continent] || [];
    if (periods.length > 0) {
      continentsPlayed++;
      // Sum points from all periods (each period stores its point value)
      periods.forEach(period => {
        if (typeof period === 'object' && period.points) {
          baseScore += period.points;
        } else if (typeof period === 'number') {
          baseScore += period; // Backwards compatibility
        }
      });
    }
  });
  
  // Apply continent diversity bonus
  const bonusPercent = CONTINENT_BONUS_TIERS[continentsPlayed] || 0;
  const bonusScore = Math.floor(baseScore * (bonusPercent / 100));
  const totalScore = baseScore + bonusScore;
  
  return {
    baseScore,
    bonusScore,
    totalScore,
    continentsPlayed,
    bonusPercent
  };
};

// Helper function to get level from total score
const getLevelFromScore = (totalScore) => {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalScore >= LEVELS[i].minPoints) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
};

// Helper function to get period end year based on start year
const getPeriodEndYear = (startYear, continent = null) => {
  // Special handling for Antarctica - use much larger time periods
  if (continent === 'Antarctica') {
    // Antarctica starts at 1770 (first exploration), use 50-year periods throughout
    const antarcticaStart = 1770;
    if (startYear < antarcticaStart) {
      return antarcticaStart;
    }
    // 50-year periods: 1770-1820, 1821-1870, 1871-1920, 1921-1970, 1971-2000
    const periodStart = Math.floor((startYear - antarcticaStart) / 50) * 50 + antarcticaStart;
    const endYear = periodStart + 50;
    return Math.min(endYear, 2000); // Cap at 2000
  }
  
  // Standard periods for other continents
  if (startYear < 1701) {
    // 50-year periods: 1500-1550, 1551-1600, 1601-1650, 1651-1700
    const periodStart = Math.floor((startYear - 1500) / 50) * 50 + 1500;
    return periodStart + 50;
  } else if (startYear < 1801) {
    // 20-year periods: 1701-1720, 1721-1740, 1741-1760, 1761-1780, 1781-1800
    const periodStart = Math.floor((startYear - 1701) / 20) * 20 + 1701;
    return periodStart + 20;
  } else if (startYear < 1901) {
    // 10-year periods: 1801-1810, 1811-1820, ..., 1891-1900
    const periodStart = Math.floor((startYear - 1801) / 10) * 10 + 1801;
    return periodStart + 10;
  } else if (startYear < 1951) {
    // 5-year periods: 1901-1905, 1906-1910, ..., 1946-1950
    const periodStart = Math.floor((startYear - 1901) / 5) * 5 + 1901;
    return periodStart + 5;
  } else {
    // 1-year periods: 1951-1952, 1952-1953, ..., 1999-2000
    return startYear + 1;
  }
};

// Helper function to get next period start year
const getNextPeriodStartYear = (currentYear, continent = null) => {
  const endYear = getPeriodEndYear(currentYear, continent);
  if (endYear >= 2000) {
    return 2000; // Don't go beyond 2000
  }
  // For Antarctica, use 50-year periods with gaps (endYear + 1)
  if (continent === 'Antarctica') {
    return endYear + 1;
  }
  // For 1-year periods (1951+), next period starts at endYear (no gap)
  // For all other periods, next period starts at endYear + 1 (there's a gap)
  if (currentYear >= 1951) {
    return endYear;
  }
  return endYear + 1;
};

// Helper function to get all available time periods for a continent
const getAllTimePeriods = (continent) => {
  const periods = [];
  const startYear = continent === 'Antarctica' ? 1770 : 1500;
  let currentYear = startYear;
  
  while (currentYear < 2000) {
    const endYear = getPeriodEndYear(currentYear, continent);
    if (endYear > 2000) break;
    periods.push({ start: currentYear, end: endYear });
    currentYear = getNextPeriodStartYear(currentYear, continent);
  }
  
  return periods;
};

// 3D Time Cylinder Component
const TimeCylinder = ({ continent, currentYear, onPeriodSelect, isMobile }) => {
  const periods = getAllTimePeriods(continent);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startRotation, setStartRotation] = useState(0);
  const cylinderRef = useRef(null);
  
  // Calculate rotation to show current period
  useEffect(() => {
    const currentIndex = periods.findIndex(p => p.start === currentYear);
    if (currentIndex !== -1 && periods.length > 0) {
      const anglePerPeriod = 360 / periods.length;
      const targetRotation = -currentIndex * anglePerPeriod;
      setRotation(targetRotation);
    }
  }, [currentYear, continent, periods]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.clientX || e.touches?.[0]?.clientX);
    setStartRotation(rotation);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMoveGlobal = (e) => {
      if (!isDragging) return;
      const currentX = e.clientX || e.touches?.[0]?.clientX;
      const deltaX = currentX - startX;
      const sensitivity = 0.5;
      const newRotation = startRotation + deltaX * sensitivity;
      setRotation(newRotation);
    };

    const handleMouseUpGlobal = () => {
      if (!isDragging) return;
      setIsDragging(false);
      
      // Snap to nearest period
      const anglePerPeriod = 360 / periods.length;
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      const nearestIndex = Math.round(Math.abs(normalizedRotation) / anglePerPeriod) % periods.length;
      const actualIndex = normalizedRotation < 0 
        ? (periods.length - nearestIndex) % periods.length 
        : nearestIndex;
      const targetRotation = -actualIndex * anglePerPeriod;
      setRotation(targetRotation);
      
      // Select the period
      if (periods[actualIndex]) {
        onPeriodSelect(periods[actualIndex].start);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUpGlobal);
      document.addEventListener('touchmove', handleMouseMoveGlobal, { passive: false });
      document.addEventListener('touchend', handleMouseUpGlobal);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMoveGlobal);
        document.removeEventListener('mouseup', handleMouseUpGlobal);
        document.removeEventListener('touchmove', handleMouseMoveGlobal);
        document.removeEventListener('touchend', handleMouseUpGlobal);
      };
    }
  }, [isDragging, startX, startRotation, rotation, periods, onPeriodSelect]);

  const cylinderSize = isMobile ? 80 : 100;
  const radius = cylinderSize * 0.8;
  const anglePerPeriod = periods.length > 0 ? 360 / periods.length : 0;

  return (
    <div
      ref={cylinderRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
      style={{
        width: `${cylinderSize}px`,
        height: `${cylinderSize * 1.5}px`,
        position: 'relative',
        perspective: '1000px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `rotateY(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        {periods.map((period, index) => {
          const isCurrent = period.start === currentYear;
          const angle = index * anglePerPeriod;
          const x = Math.sin((angle * Math.PI) / 180) * radius;
          const z = Math.cos((angle * Math.PI) / 180) * radius;
          const opacity = Math.abs(angle % 360) < 45 || Math.abs(angle % 360) > 315 ? 1 : 0.3;
          
          return (
            <div
              key={`${period.start}-${period.end}`}
              onClick={() => onPeriodSelect(period.start)}
              style={{
                position: 'absolute',
                width: `${cylinderSize * 0.6}px`,
                height: `${cylinderSize * 0.8}px`,
                left: '50%',
                top: '50%',
                marginLeft: `-${cylinderSize * 0.3}px`,
                marginTop: `-${cylinderSize * 0.4}px`,
                backgroundColor: isCurrent ? '#3498db' : '#222',
                border: isCurrent ? '2px solid #fff' : '1px solid #444',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
                transform: `translate3d(${x}px, 0, ${z}px) rotateY(${angle}deg)`,
                transformStyle: 'preserve-3d',
                opacity: opacity,
                transition: isDragging ? 'none' : 'opacity 0.3s ease',
                boxShadow: isCurrent 
                  ? '0 4px 8px rgba(52, 152, 219, 0.5)'
                  : '0 2px 4px rgba(0, 0, 0, 0.3)',
                pointerEvents: opacity > 0.5 ? 'auto' : 'none'
              }}
            >
              <div style={{
                fontSize: isMobile ? '9px' : '11px',
                fontWeight: 'bold',
                color: '#fff',
                textAlign: 'center',
                marginBottom: '2px'
              }}>
                {period.start}
              </div>
              <div style={{
                fontSize: isMobile ? '7px' : '9px',
                color: '#bbb',
                textAlign: 'center'
              }}>
                {period.end}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [showInstructions, setShowInstructions] = useState(false);
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
    return saved ? JSON.parse(saved) : CONTINENTS.reduce((acc, cont) => ({ 
      ...acc, 
      [cont]: cont === 'Antarctica' ? 1770 : 1500 
    }), {});
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

  // Calculate total score and level
  const scoreData = calculateTotalScore(continentScores);
  const currentLevel = getLevelFromScore(scoreData.totalScore);

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
      const defaultYear = continent === 'Antarctica' ? 1770 : 1500;
      const year = progress[continent] || defaultYear;
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
    const endYear = getPeriodEndYear(year, continentName);

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
      
      // If 2+ correct answers, add points for this continent/time period
      if (correctCount >= 2 && selectedContinent) {
        const periodKey = content.period;
        const points = correctCount === 3 ? 3 : 2; // 3 points for all correct, 2 for 2 correct
        
        setContinentScores(prev => {
          const newScores = { ...prev };
          if (!newScores[selectedContinent]) {
            newScores[selectedContinent] = [];
          }
          
          // Check if this period already exists
          const periodIndex = newScores[selectedContinent].findIndex(
            p => (typeof p === 'object' ? p.period : p) === periodKey || (typeof p === 'string' && p === `${selectedContinent}_${periodKey}`)
          );
          
          if (periodIndex === -1) {
            // Add new period with points
            newScores[selectedContinent].push({ period: periodKey, points });
          } else {
            // Update points if higher (shouldn't happen, but just in case)
            const existing = newScores[selectedContinent][periodIndex];
            if (typeof existing === 'object' && existing.period) {
              if (points > (existing.points || 2)) {
                newScores[selectedContinent][periodIndex] = { period: periodKey, points };
              }
            } else {
              // Migrate old format to new format
              newScores[selectedContinent][periodIndex] = { period: periodKey, points };
            }
          }
          
          return newScores;
        });
      }
      
      // Check if this is the first completed round
      if (!hasCompletedFirstRound && selectedContinent) {
        setHasCompletedFirstRound(true);
        if (!userName) {
          setShowNameInput(true);
        } else {
          // If user already has a name, make sure scrambled name is set
          if (!scrambledName && userName) {
            setScrambledName(scrambleName(userName));
          }
        }
      }
    }
  };

  const handleMoveAhead = () => {
    const nextYear = getNextPeriodStartYear(progress[selectedContinent], selectedContinent);
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
    } else {
      // If no name provided, use a scrambled American name
      const americanNames = ['Michael', 'James', 'John', 'Robert', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Christopher'];
      const randomName = americanNames[Math.floor(Math.random() * americanNames.length)];
      const scrambled = scrambleName(randomName);
      setUserName(randomName);
      setScrambledName(scrambled);
      setShowNameInput(false);
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
        height: (hasCompletedFirstRound && scrambledName) ? '80px' : '60px',
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
        {hasCompletedFirstRound && scrambledName && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 'bold', color: '#fff' }}>
              {scoreData.totalScore} pts
            </div>
            <div style={{ fontSize: isMobile ? '12px' : '14px', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div>
                User: <span style={{ fontWeight: 'bold', color: '#fff' }}>{scrambledName}</span>
              </div>
              <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#3498db', marginTop: '2px' }}>
                {currentLevel.name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LEFT PANEL: CONTENT */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? 'auto' : '100vh',
        padding: '30px',
        paddingTop: (hasCompletedFirstRound && scrambledName) ? '100px' : '80px', // Account for fixed header
        paddingBottom: hasCompletedFirstRound ? '60px' : '30px', // Space for instructions button
        overflowY: 'auto', 
        backgroundColor: '#111', 
        color: '#fff', 
        borderBottom: isMobile ? '2px solid #333' : 'none',
        borderRight: isMobile ? 'none' : '2px solid #333',
        boxSizing: 'border-box',
        position: 'relative'
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
        
      {/* Instructions Button - Fixed at bottom left */}
      {hasCompletedFirstRound && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? '170px' : '20px',
          left: isMobile ? '20px' : '25vw',
          zIndex: 999
        }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              padding: '0',
              cursor: 'pointer',
              fontSize: '14px',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.target.style.color = '#888';
            }}
          >
            instructions
          </button>
        </div>
      )}

      {/* RIGHT PANEL: GLOBE */}
      <div style={{ 
        width: isMobile ? '100vw' : '50vw', 
        height: isMobile ? '50vh' : '100vh',
        backgroundColor: '#000',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
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
        <div style={{ flex: '1', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          
          {/* 3D Time Cylinder - Desktop: next to globe */}
          {!isMobile && selectedContinent && (
            <div style={{
              position: 'absolute',
              right: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 100
            }}>
              <TimeCylinder 
                continent={selectedContinent}
                currentYear={progress[selectedContinent] || (selectedContinent === 'Antarctica' ? 1770 : 1500)}
                onPeriodSelect={(startYear) => {
                  setProgress(prev => ({ ...prev, [selectedContinent]: startYear }));
                  setAnswers({});
                  setShowMoveAhead(false);
                  setTimeLeft(60);
                  setContent({ period: '', paragraph: '', questions: [] });
                  fetchHistory(startYear, selectedContinent);
                }}
                isMobile={isMobile}
              />
            </div>
          )}
        </div>
      </div>

      {/* 3D Time Cylinder - Mobile: Fixed at bottom right, visible over globe */}
      {isMobile && selectedContinent && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 998
        }}>
          <TimeCylinder 
            continent={selectedContinent}
            currentYear={progress[selectedContinent] || (selectedContinent === 'Antarctica' ? 1770 : 1500)}
            onPeriodSelect={(startYear) => {
              setProgress(prev => ({ ...prev, [selectedContinent]: startYear }));
              setAnswers({});
              setShowMoveAhead(false);
              setTimeLeft(60);
              setContent({ period: '', paragraph: '', questions: [] });
              fetchHistory(startYear, selectedContinent);
            }}
            isMobile={isMobile}
          />
        </div>
      )}
      
      {/* Instructions Modal */}
      {showInstructions && (
        <div 
          onClick={() => setShowInstructions(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            animation: 'fadeIn 0.3s ease-in'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#222',
              padding: '40px',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid #444',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '24px', textTransform: 'lowercase' }}>instructions</h2>
              <button
                onClick={() => setShowInstructions(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: '28px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => e.target.style.color = '#fff'}
                onMouseLeave={(e) => e.target.style.color = '#888'}
              >
                ×
              </button>
            </div>
            <ol style={{ 
              color: '#fff', 
              lineHeight: '1.8', 
              fontSize: '16px',
              paddingLeft: '20px',
              margin: 0,
              textTransform: 'lowercase'
            }}>
              <li style={{ marginBottom: '12px' }}>click on any continent on the globe to explore its history</li>
              <li style={{ marginBottom: '12px' }}>read the historical paragraph about that time period</li>
              <li style={{ marginBottom: '12px' }}>answer 3 multiple-choice questions (you have 60 seconds)</li>
              <li style={{ marginBottom: '12px' }}>get 2 points for 2 correct answers, or 3 points for all 3 correct</li>
              <li style={{ marginBottom: '12px' }}>explore different continents to earn bonus points</li>
              <li style={{ marginBottom: '12px' }}>progress through time periods by clicking "next era"</li>
              <li style={{ marginBottom: '0' }}>level up by earning more points across different continents</li>
            </ol>
          </div>
        </div>
      )}

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
