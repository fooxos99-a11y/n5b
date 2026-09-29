import { useEffect, useState } from 'react';

const readMatch = (query) => (
  typeof window !== 'undefined' && window.matchMedia(query).matches
);

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => readMatch(query));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, [query]);

  return matches;
};

export default useMediaQuery;
