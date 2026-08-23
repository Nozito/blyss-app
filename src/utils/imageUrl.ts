const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  // En dev le proxy Vite redirige /uploads → localhost:3001/uploads
  // En prod API_BASE_URL = https://app.blyssapp.fr (nginx proxifie /uploads)
  // imagePath a toujours un "/" en tête (ex: "/uploads/...") — ne pas en
  // rajouter un second, sinon "//uploads/..." casse le chemin sur certains hébergeurs.
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${API_BASE_URL}${path}`;
};
