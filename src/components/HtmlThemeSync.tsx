// src/components/HtmlThemeSync.tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// .admin-theme (fond noir) est scopé à une <div> interne (AdminLayout), pas à
// <html>. Sans ça, le rebond iOS (overscroll/pull-to-refresh) — peint par
// <html>, pas par la div — reste toujours blanc, même sur les pages admin.
const HtmlThemeSync = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const isAdmin = pathname.startsWith("/admin");
    document.documentElement.classList.toggle("admin-theme", isAdmin);
  }, [pathname]);

  return null;
};

export default HtmlThemeSync;
