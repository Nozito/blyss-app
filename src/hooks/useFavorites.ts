import { useState, useEffect } from "react";

interface Favorite {
  id: number;
  name: string;
  specialty: string;
  location: string;
  rating: number;
  reviews: number;
}

const STORAGE_KEY = "blyss_favorites";

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Favorite[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const addFavorite = (specialist: Favorite) => {
    setFavorites((prev) => {
      if (prev.find((f) => f.id === specialist.id)) return prev;
      return [...prev, specialist];
    });
  };

  const removeFavorite = (id: number) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  };

  const isFavorite = (id: number) => {
    return favorites.some((f) => f.id === id);
  };

  const toggleFavorite = (specialist: Favorite) => {
    if (isFavorite(specialist.id)) {
      removeFavorite(specialist.id);
    } else {
      addFavorite(specialist);
    }
  };

  return { favorites, addFavorite, removeFavorite, isFavorite, toggleFavorite };
};
