// ---------------------------------------------------------------------------
// Entry point — wraps the app with Router and ThemeProvider.
// Multi-page routing: Home, Watch (player), Category, Admin
// ---------------------------------------------------------------------------
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import Layout from './components/Layout.jsx';
import './index.css';

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const WatchPage = lazy(() => import('./pages/WatchPage.jsx'));
const CategoryPage = lazy(() => import('./pages/CategoryPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

function PageLoader() {
  return (
    <div className="page-container flex min-h-[40vh] items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" role="status" aria-label="Loading" />
    </div>
  );
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/watch" element={<WatchPage />} />
              <Route path="/category/:group" element={<CategoryPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);