import { useState, useEffect, useCallback } from "react";
import { favoritesApi } from "@/services/api";

interface Favorite {
  id: number;
  name: string;
  specialty: string;
  location: string;
  rating: number;
  reviews: number;
}

/**
 * Manages favorites via the /api/favorites backend endpoint.
 * Optimistic UI updates with server sync.
 * SECURITY: No localStorage — favorites are persisted server-side, per authenticated user.
 */
export const useFavorites = () => {
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load favorites from API on mount
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await favoritesApi.getAll();
        if (res.success && Array.isArray(res.data)) {
          const ids = new Set<number>(res.data.map((f: any) => f.pro_id ?? f.id));
          setFavoriteIds(ids);
          setFavorites(res.data);
        }
      } catch {
        // Not authenticated or network error — silent fail
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const isFavorite = useCallback(
    (id: number) => favoriteIds.has(id),
    [favoriteIds]
  );

  const addFavorite = useCallback(async (specialist: Favorite) => {
    // Optimistic update
    setFavoriteIds((prev) => new Set([...prev, specialist.id]));
    setFavorites((prev) =>
      prev.find((f) => f.id === specialist.id) ? prev : [...prev, specialist]
    );
    try {
      await favoritesApi.add(specialist.id);
    } catch {
      // Rollback on error
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(specialist.id);
        return next;
      });
      setFavorites((prev) => prev.filter((f) => f.id !== specialist.id));
    }
  }, []);

  const removeFavorite = useCallback(async (id: number) => {
    const removed = favorites.find((f) => f.id === id);
    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    try {
      await favoritesApi.remove(id);
    } catch {
      // Rollback on error
      if (removed) {
        setFavoriteIds((prev) => new Set([...prev, id]));
        setFavorites((prev) => [...prev, removed]);
      }
    }
  }, [favorites]);

  const toggleFavorite = useCallback(
    async (specialist: Favorite) => {
      if (isFavorite(specialist.id)) {
        await removeFavorite(specialist.id);
      } else {
        await addFavorite(specialist);
      }
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  return { favorites, addFavorite, removeFavorite, isFavorite, toggleFavorite, isLoading };
};
